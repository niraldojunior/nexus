import {
    getMatchByNetwinPattern,
    NetwinPatterns,
} from '@/shared/util/netwin-patterns.util';

describe('NetwinPatterns', () => {
    it('should match lineId in response', () => {
        const xml = `<ns1:item xsi:type="ns1:CharacteristicExt"><ns1:value xmlns:xs="http://www.w3.org/2001/XMLSchema" xsi:type="xs:string">123456</ns1:value><ns1:characteristic>lineId</ns1:characteristic></ns1:item>`;
        const result = getMatchByNetwinPattern(
            xml,
            NetwinPatterns.patternLineIdXMLToFindInResponse,
        );
        expect(result[0]).toBe('123456');
    });

    it('should match HSI in response', () => {
        const xml = `<ns1:type>CFS.HSI</ns1:type><ns1:uniqueCode>HSI123</ns1:uniqueCode><ns1:name>HSI_NAME</ns1:name>`;
        const result = getMatchByNetwinPattern(
            xml,
            NetwinPatterns.patternHSIXMLToFindInResponse,
        );
        expect(result[0]).toBe('HSI123');
        expect(result[1]).toBe('HSI_NAME');
    });

    it('should match manufacturer', () => {
        const xml = `<ns1:item xsi:type="ns1:CharacteristicExt"><ns1:value xmlns:xs="http://www.w3.org/2001/XMLSchema" xsi:type="xs:string">NOKIA</ns1:value><ns1:characteristic>FABRICANTE</ns1:characteristic></ns1:item>`;
        const result = getMatchByNetwinPattern(
            xml,
            NetwinPatterns.patternManufacturer,
        );
        expect(result[0]).toBe('NOKIA');
    });

    it('should match IP address', () => {
        const xml = `<ns1:item xsi:type="ns1:CharacteristicExt"><ns1:value xmlns:xs="http://www.w3.org/2001/XMLSchema" xsi:type="xs:string">10.0.0.1</ns1:value><ns1:characteristic>ENDERECO_IP</ns1:characteristic></ns1:item>`;
        const result = getMatchByNetwinPattern(
            xml,
            NetwinPatterns.patternIpAddress,
        );
        expect(result[0]).toBe('10.0.0.1');
    });

    it('should match model', () => {
        const xml = `<ns1:item xsi:type="ns1:CharacteristicExt"><ns1:value xmlns:xs="http://www.w3.org/2001/XMLSchema" xsi:type="xs:string">MODEL_XYZ</ns1:value><ns1:characteristic>MODELO</ns1:characteristic></ns1:item>`;
        const result = getMatchByNetwinPattern(
            xml,
            NetwinPatterns.patternModel,
        );
        expect(result[0]).toBe('MODEL_XYZ');
    });

    it('should match state service', () => {
        const xml = `<ns1:state_Service>ACTIVE</ns1:state_Service>`;
        const result = getMatchByNetwinPattern(
            xml,
            NetwinPatterns.patternStateService,
        );
        expect(result[0]).toBe('ACTIVE');
    });

    it('should match subscriberId', () => {
        const xml = `<ns1:item xsi:type="ns1:CharacteristicExt"><ns1:value xmlns:xs="http://www.w3.org/2001/XMLSchema" xsi:type="xs:string">SUB123</ns1:value><ns1:characteristic>subscriberId</ns1:characteristic></ns1:item>`;
        const result = getMatchByNetwinPattern(
            xml,
            NetwinPatterns.patternSubscriberId,
        );
        expect(result[0]).toBe('SUB123');
    });

    it('should match idEndereco', () => {
        const xml = `<ns1:item xsi:type="ns1:CharacteristicExt"><ns1:value xmlns:xs="http://www.w3.org/2001/XMLSchema" xsi:type="xs:string">END123</ns1:value><ns1:characteristic>idEndereco</ns1:characteristic></ns1:item>`;
        const result = getMatchByNetwinPattern(
            xml,
            NetwinPatterns.patternIdEndereco,
        );
        expect(result[0]).toBe('END123');
    });

    it('should match municipio', () => {
        const xml = `<ns1:item xsi:type="ns1:CharacteristicExt"><ns1:value xmlns:xs="http://www.w3.org/2001/XMLSchema" xsi:type="xs:string">RIO</ns1:value><ns1:characteristic>municipioSurvey</ns1:characteristic></ns1:item>`;
        const result = getMatchByNetwinPattern(
            xml,
            NetwinPatterns.patternMunicipio,
        );
        expect(result[0]).toBe('RIO');
    });

    it('should return empty array if no match', () => {
        const xml = `<noMatch>nothing here</noMatch>`;
        const result = getMatchByNetwinPattern(
            xml,
            NetwinPatterns.patternModel,
        );
        expect(result).toEqual([]);
    });

    it('should match patternGestaoOnt', () => {
        const xml = `<gestaoOnt>ONT_DATA</gestaoOnt>`;
        const result = getMatchByNetwinPattern(
            xml,
            NetwinPatterns.patternGestaoOnt,
        );
        expect(result[0]).toBe('ONT_DATA');
    });

    it('should match patternModelCpeEntity', () => {
        const xml = `<model>MODEL_CPE</model>`;
        const result = getMatchByNetwinPattern(
            xml,
            NetwinPatterns.patternModelCpeEntity,
        );
        expect(result[0]).toBe('MODEL_CPE');
    });

    it('should match patternFlagBloqueio', () => {
        const xml = `<ns1:item xsi:type="ns1:CharacteristicExt"><ns1:value xmlns:xs="http://www.w3.org/2001/XMLSchema" xsi:type="xs:string">BLOQUEADO</ns1:value><ns1:characteristic>bloqueio</ns1:characteristic></ns1:item>`;
        const result = getMatchByNetwinPattern(
            xml,
            NetwinPatterns.patternFlagBloqueio,
        );
        expect(result[0]).toBe('BLOQUEADO');
    });
});
