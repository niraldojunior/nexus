import oracledb from 'oracledb';
import type { MigrationContext } from './context.js';
import { bulkInsertRows } from './context.js';
import { deterministicUuid, netwinLocationId, NEXUS_NETWIN_NAMESPACE } from './identity.js';
import type { PhaseStats } from './types.js';

// Parser de endereço brasileiro do Netwin
// Ex: "RUA ATAULPHO COUTINHO, 80, BLOCO 1, BARRA DA TIJUCA, RIO DE JANEIRO - RJ 22793520"
export function parseAddressString(raw: string | null | undefined) {
  if (!raw || !raw.trim()) return null;
  const parts = raw.split(',').map((p) => p.trim()).filter(Boolean);
  if (parts.length === 0) return null;

  const street = parts[0] ?? '';
  const streetNr = parts.length > 1 ? parts[1] : null;

  const tail = parts[parts.length - 1] ?? '';
  const postcodeMatch = tail.match(/(\d{8})\s*$/);
  const postcode = postcodeMatch ? postcodeMatch[1] : null;

  const cityUf = tail.replace(/\d{8}\s*$/, '').trim();
  const [cityRaw, ufRaw] = cityUf.split(/\s*-\s*/);

  const locality = parts.length > 3 ? parts[parts.length - 2] : null;

  return {
    street,
    streetNr: streetNr === 'SN' || streetNr === 'S/N' ? 'S/N' : streetNr,
    locality: locality ?? null,
    city: cityRaw ? cityRaw.trim() : null,
    stateOrProvince: ufRaw ? ufRaw.trim().toUpperCase() : null,
    postcode,
  };
}

export async function runPhase2Locations(ctx: MigrationContext): Promise<PhaseStats> {
  const stats: PhaseStats = { loaded: 0, updated: 0, skipped: 0, rejected: 0, errors: 0 };
  console.log('\n=== Fase 2.A: Locais, Endereços e Hierarquia (GeographicSite) ===');

  const source = await ctx.getSourceConnection();
  const target = await ctx.getTargetConnection();

  try {
    // Monta WHERE com base no escopo (UF, Município ou Full)
    const whereClauses: string[] = ['l.ID > :lastId'];
    const binds: Record<string, string | number> = { lastId: 0, batchSize: ctx.options.batchSize };

    if (ctx.options.scope.uf) {
      whereClauses.push(`(UPPER(a.NAME) LIKE :ufPattern OR UPPER(l.NAME) LIKE :ufPattern)`);
      binds.ufPattern = `%- ${ctx.options.scope.uf.toUpperCase()}%`;
    }

    if (ctx.options.scope.municipio) {
      const muniUpper = ctx.options.scope.municipio.toUpperCase();
      const muniClean = muniUpper.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      binds.muniPattern1 = `%${muniUpper}%`;
      binds.muniPattern2 = `%${muniClean}%`;

      const exchRes = await source.execute<{ ID: number }>(
        `SELECT l.ID
         FROM NETWIN.LOCATION l
         WHERE l.ID IN (
           SELECT ID FROM NETWIN.LOCATION WHERE UPPER(NAME) = :muniClean OR UPPER(NAME) = :muniUpper
           UNION
           SELECT ID_CHILD FROM NETWIN.LOCATION_ASSOC WHERE ID_PARENT IN (
             SELECT ID FROM NETWIN.LOCATION WHERE UPPER(NAME) = :muniClean OR UPPER(NAME) = :muniUpper
           )
         )`,
        { muniClean, muniUpper },
        { outFormat: oracledb.OUT_FORMAT_OBJECT },
      );
      const exchIds = (exchRes.rows ?? []).map((r) => r.ID);
      if (exchIds.length > 0) {
        whereClauses.push(`(l.ID IN (${exchIds.join(',')}) OR UPPER(a.NAME) LIKE :muniPattern1 OR UPPER(a.NAME) LIKE :muniPattern2 OR UPPER(l.NAME) LIKE :muniPattern1)`);
      } else {
        whereClauses.push(`(UPPER(a.NAME) LIKE :muniPattern1 OR UPPER(a.NAME) LIKE :muniPattern2 OR UPPER(l.NAME) LIKE :muniPattern1)`);
      }
    }

    let lastId = 0;
    let totalProcessed = 0;
    const maxRecords = ctx.options.maxRecords ?? Infinity;

    for (;;) {
      if (totalProcessed >= maxRecords) break;
      binds.lastId = lastId;

      const currentLimit = Math.min(ctx.options.batchSize, maxRecords - totalProcessed);
      binds.batchSize = currentLimit;

      // Consulta otimizada em streaming por keyset pagination
      const query = `
        SELECT *
        FROM (
          SELECT l.ID, l.NAME, l.LATITUDE, l.LONGITUDE, l.ID_CAT_ENTITY, l.STATE_LIFECYCLE,
                 ce.NAME as CAT_NAME, ce.DESCRIPTION as CAT_DESC, a.NAME as ADDRESS_TEXT
          FROM NETWIN.LOCATION l
          LEFT JOIN NETWIN.CAT_ENTITY ce ON ce.ID = l.ID_CAT_ENTITY
          LEFT JOIN NETWIN.LOCATION_ADDRESS_ASSOC laa ON laa.ID_LOCATION = l.ID
          LEFT JOIN NETWIN.ADDRESS a ON a.ID = laa.ID_ADDRESS
          WHERE ${whereClauses.join(' AND ')}
          ORDER BY l.ID
        )
        WHERE ROWNUM <= :batchSize
      `;

      const result = await source.execute<{
        ID: number;
        NAME: string | null;
        LATITUDE: number | null;
        LONGITUDE: number | null;
        ID_CAT_ENTITY: number | null;
        STATE_LIFECYCLE: string | null;
        CAT_NAME: string | null;
        CAT_DESC: string | null;
        ADDRESS_TEXT: string | null;
      }>(query, binds, {
        outFormat: oracledb.OUT_FORMAT_OBJECT,
        fetchArraySize: currentLimit,
      });

      const rows = result.rows ?? [];
      if (rows.length === 0) break;

      const locationsToInsert: Array<Record<string, unknown>> = [];
      const addressesToInsert: Array<Record<string, unknown>> = [];
      const sitesToInsert: Array<Record<string, unknown>> = [];
      const batchIds: number[] = [];
      const seenIds = new Set<number>();

      for (const row of rows) {
        lastId = Math.max(lastId, row.ID);
        if (seenIds.has(row.ID)) continue;
        seenIds.add(row.ID);
        batchIds.push(row.ID);

        const lat = row.LATITUDE ? Number(row.LATITUDE) : null;
        const lng = row.LONGITUDE ? Number(row.LONGITUDE) : null;
        const hasPoint = lat !== null && lng !== null && lng >= -75 && lng <= -32 && lat >= -35 && lat <= 6;

        const siteId = netwinLocationId(row.ID);
        const locId = deterministicUuid(NEXUS_NETWIN_NAMESPACE, `LOCATION:GEO:${row.ID}`);
        const siteName = (row.NAME ?? `Local ${row.ID}`).trim();

        // 1. GeographicLocation (Point WGS84)
        if (hasPoint) {
          locationsToInsert.push({
            id: locId,
            tenant_id: ctx.options.tenantId,
            geometry_type: 'Point',
            geometry: JSON.stringify({ type: 'Point', coordinates: [lng, lat] }),
            spatial_ref: 'EPSG:4326',
            reference_point: siteName.slice(0, 255),
            characteristics: '[]',
          });
        }

        // 2. GeographicAddress
        const parsedAddr = parseAddressString(row.ADDRESS_TEXT);
        const addrId = parsedAddr ? deterministicUuid(NEXUS_NETWIN_NAMESPACE, `LOCATION:ADDR:${row.ID}`) : null;
        if (parsedAddr && addrId) {
          addressesToInsert.push({
            id: addrId,
            tenant_id: ctx.options.tenantId,
            street_name: parsedAddr.street.slice(0, 255),
            street_nr: parsedAddr.streetNr ? parsedAddr.streetNr.slice(0, 50) : null,
            locality: parsedAddr.locality ? parsedAddr.locality.slice(0, 100) : null,
            city: parsedAddr.city ? parsedAddr.city.slice(0, 100) : null,
            state_or_province: parsedAddr.stateOrProvince ? parsedAddr.stateOrProvince.slice(0, 50) : null,
            country: 'BR',
            postcode: parsedAddr.postcode,
            geographic_location_id: hasPoint ? locId : null,
            characteristics: '[]',
          });
        }

        // 3. GeographicSite (classificação de spec a partir de CAT_NAME / CAT_DESC)
        const catName = (row.CAT_NAME ?? '').toUpperCase();
        const catDesc = (row.CAT_DESC ?? '').toUpperCase();
        let specCode = 'BUILDING';
        if (catName.includes('POLE') || catDesc.includes('POSTE')) specCode = 'POLE';
        else if (catName.includes('MANHOLE') || catDesc.includes('CAIXA')) specCode = 'MANHOLE';
        else if (catName.includes('CENTRAL') || catName.includes('STATION') || catName.includes('CENTRO') || catName.includes('LOCALITY') || catName.includes('CITYAREA')) specCode = 'CENTRAL_OFFICE';
        else if (catName.includes('ROOM') || catName.includes('SALA') || catDesc.includes('ROOM')) specCode = 'ROOM';
        else if (catName.includes('FLOOR') || catName.includes('ANDAR')) specCode = 'FLOOR';
        else if (catName.includes('CABINET') || catName.includes('ARMARIO')) specCode = 'CABINET';
        else if (catName.includes('SURVEY') || catDesc.includes('CLIENT')) specCode = 'CUSTOMER_SITE';
        else if (catName.includes('REMOTE_UNIT.UR') || catDesc.includes('UNIDADE REMOTA')) specCode = 'REMOTE_UNIT';

        const specId = deterministicUuid(NEXUS_NETWIN_NAMESPACE, `SITE_SPEC:${specCode}`);

        sitesToInsert.push({
          id: siteId,
          tenant_id: ctx.options.tenantId,
          name: siteName.slice(0, 255),
          site_specification_id: specId,
          status: 'Active',
          geographic_location_id: hasPoint ? locId : null,
          geographic_address_id: addrId,
          parent_site_id: null, // Resolvido no segundo passo do lote
          related_party: JSON.stringify([{ id: ctx.options.ownerPartyId, '@referredType': 'Organization' }]),
          characteristics: JSON.stringify([
            { group: '_origin', name: 'system', value: 'Netwin', valueType: 'string' },
            { group: '_origin', name: 'entity', value: 'LOCATION', valueType: 'string' },
            { group: '_origin', name: 'id', value: String(row.ID), valueType: 'string' },
            ...(row.STATE_LIFECYCLE ? [{ name: 'stateLifecycle', value: row.STATE_LIFECYCLE, valueType: 'string' }] : []),
          ]),
        });
      }

      // Gravação em lote no Nexus Oracle
      if (target) {
        if (locationsToInsert.length > 0) {
          await bulkInsertRows(
            target,
            ctx.t,
            'tmf_geographic_location',
            ['id', 'tenant_id', 'geometry_type', 'geometry', 'spatial_ref', 'reference_point', 'characteristics'],
            locationsToInsert,
          );
        }

        if (addressesToInsert.length > 0) {
          await bulkInsertRows(
            target,
            ctx.t,
            'tmf_geographic_address',
            ['id', 'tenant_id', 'street_name', 'street_nr', 'locality', 'city', 'state_or_province', 'country', 'postcode', 'geographic_location_id', 'characteristics'],
            addressesToInsert,
          );
        }

        if (sitesToInsert.length > 0) {
          await bulkInsertRows(
            target,
            ctx.t,
            'tmf_geographic_site',
            ['id', 'tenant_id', 'name', 'site_specification_id', 'status', 'geographic_location_id', 'geographic_address_id', 'parent_site_id', 'related_party', 'characteristics'],
            sitesToInsert,
          );
        }

        // 4. Resolução da Hierarquia (LOCATION_ASSOC) para o lote atual
        const assocs: Array<{ ID_PARENT: number; ID_CHILD: number }> = [];
        for (let i = 0; i < batchIds.length; i += 900) {
          const chunk = batchIds.slice(i, i + 900);
          const parentBinds = chunk.map((_, idx) => `:${idx + 1}`).join(',');
          const assocResult = await source.execute<{ ID_PARENT: number; ID_CHILD: number }>(
            `SELECT ID_PARENT, ID_CHILD FROM NETWIN.LOCATION_ASSOC WHERE ID_CHILD IN (${parentBinds})`,
            chunk,
            { outFormat: oracledb.OUT_FORMAT_OBJECT },
          );
          if (assocResult.rows) assocs.push(...assocResult.rows);
        }

        if (assocs.length > 0) {
          const updateSql = `
            UPDATE ${ctx.t('tmf_geographic_site')} s
            SET s.parent_site_id = :1
            WHERE s.id = :2
              AND EXISTS (SELECT 1 FROM ${ctx.t('tmf_geographic_site')} p WHERE p.id = :1)
          `;
          const updateData = assocs.map((a) => [netwinLocationId(a.ID_PARENT), netwinLocationId(a.ID_CHILD)]);
          await target.executeMany(updateSql, updateData, { autoCommit: false });
        }

        await target.execute('COMMIT');
      }

      totalProcessed += rows.length;
      stats.loaded += sitesToInsert.length;
      console.log(`Lote processado: +${rows.length} locais (Total acumulado: ${totalProcessed}, Último ID: ${lastId})`);
    }

    console.log(`Fase 2.A concluída: ${stats.loaded} locais e hierarquias carregados.`);
    return stats;
  } finally {
    await source.close();
    if (target) await target.close();
  }
}
