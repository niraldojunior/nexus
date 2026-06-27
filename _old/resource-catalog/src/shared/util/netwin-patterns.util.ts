/**
 * Object that contains RegEx for extraction of fields in the Netwin responses.
 * If the field isn't found, returns ''.
 */
export const NetwinPatterns = {
    patternLineIdXMLToFindInResponse:
        /<ns\d+:item\s+xsi:type="ns\d+:CharacteristicExt"><ns\d+:value\s+xmlns:xs="http:\/\/www\.w3\.org\/2001\/XMLSchema"\s+xsi:type="xs:string">([^"]+)<\/ns\d+:value><ns\d+:characteristic>lineId<\/ns\d+:characteristic><\/ns\d+:item>/,
    patternHSIXMLToFindInResponse:
        /<ns\d+:type>CFS\.HSI<\/ns\d+:type><ns\d+:uniqueCode>([^"]+)<\/ns\d+:uniqueCode><ns\d+:name>([^"]+)<\/ns\d+:name>/,
    patternVOIPXMLToFindInResponse:
        /<ns\d+:type>CFS\.VOIP<\/ns\d+:type><ns\d+:uniqueCode>([^"]+)<\/ns\d+:uniqueCode><ns\d+:name>([^"]+)<\/ns\d+:name>/,
    patternVOIPNumber:
        /<ns\d+:item xsi:type="ns\d+:CharacteristicExt"><ns\d+:value xmlns:xs="http:\/\/www\.w3\.org\/2001\/XMLSchema" xsi:type="xs:string">([0-9.]*)<\/ns\d+:value><ns\d+:characteristic>voipNumber<\/ns\d+:characteristic><\/ns\d+:item>/,
    patternLineId:
        /(.*)\s\w*\s(\d*)\/(\d*)\/(\d*)\/(\d*)\/(\d*)\/(\d*)\/(\d*):(\d*)\/(\d*)/,
    patternManufacturer:
        /<ns\d+:item xsi:type="ns\d+:CharacteristicExt"><ns\d+:value xmlns:xs="http:\/\/www.w3.org\/2001\/XMLSchema" xsi:type="xs:string">([^"]+)<\/ns\d+:value><ns\d+:characteristic>FABRICANTE<\/ns\d+:characteristic><\/ns\d+:item>/,
    patternBng:
        /<ns\d+:primaryKey xsi:type="ns\d+:Pk"><ns\d+:type>ME\.BNG<\/ns\d+:type><ns\d+:uniqueCode>[^"]+<\/ns\d+:uniqueCode><ns\d+:name>([^"]+)<\/ns\d+:name><\/ns\d+:primaryKey>/,
    patternCdo:
        /<ns\d+:primaryKey xsi:type="ns\d+:Pk"><ns\d+:type>ME\.CDO<\/ns\d+:type><ns\d+:uniqueCode>[^"]+<\/ns\d+:uniqueCode><ns\d+:name>([^"]+)<\/ns\d+:name><\/ns\d+:primaryKey>/,
    patternCeos:
        /<ns\d+:primaryKey xsi:type="ns\d+:Pk"><ns\d+:type>ME\.CEOS<\/ns\d+:type><ns\d+:uniqueCode>[^"]+<\/ns\d+:uniqueCode><ns\d+:name>([^"]+)<\/ns\d+:name><\/ns\d+:primaryKey>/,
    patternBngSecondAttemp:
        /<ns\d+:type>ME\.BNG<\/ns\d+:type>[\s\S]*?<ns\d+:uniqueCode>([^<]+)<\/ns\d+:uniqueCode>/,
    patternSr:
        /<ns\d+:primaryKey xsi:type="ns\d+:Pk"><ns\d+:type>ME\.SR<\/ns\d+:type><ns\d+:uniqueCode>[^"]+<\/ns\d+:uniqueCode><ns\d+:name>([^"]+)<\/ns\d+:name><\/ns\d+:primaryKey>/,
    patternIpAddress:
        /<ns\d+:item xsi:type="ns\d+:CharacteristicExt"><ns\d+:value xmlns:xs="http:\/\/www\.w3\.org\/2001\/XMLSchema" xsi:type="xs:string">([0-9.]*)<\/ns\d+:value><ns\d+:characteristic>ENDERECO_IP<\/ns\d+:characteristic><\/ns\d+:item>/,
    patternModel:
        /<ns\d+:item xsi:type="ns\d+:CharacteristicExt"><ns\d+:value xmlns:xs="http:\/\/www\.w3\.org\/2001\/XMLSchema" xsi:type="xs:string">([^"]+)<\/ns\d+:value><ns\d+:characteristic>MODELO<\/ns\d+:characteristic><\/ns\d+:item>/,
    patternVersion:
        /<ns\d+:item xsi:type="ns\d+:CharacteristicExt"><ns\d+:value xmlns:xs="http:\/\/www\.w3\.org\/2001\/XMLSchema" xsi:type="xs:string">([^"]+)<\/ns\d+:value><ns\d+:characteristic>VERSAO_SOFTWARE<\/ns\d+:characteristic><\/ns\d+:item>/,
    patternIdGpon:
        /<ns\d+:primaryKey xsi:type="ns\d+:Pk"><ns\d+:type>CFS\.ACESSOGPON<\/ns\d+:type><ns\d+:uniqueCode>[^"]+<\/ns\d+:uniqueCode><ns\d+:name>([^"]+)<\/ns\d+:name><\/ns\d+:primaryKey>/,
    patternProduct:
        /<ns\d+:item xsi:type="ns\d+:CharacteristicExt"><ns\d+:value xmlns:xs="http:\/\/www\.w3\.org\/2001\/XMLSchema" xsi:type="xs:string">([^"]+)<\/ns\d+:value><ns\d+:characteristic>product<\/ns\d+:characteristic><\/ns\d+:item>/,
    patternContractSpeed:
        /<ns\d+:item xsi:type="ns\d+:CharacteristicExt"><ns\d+:value xmlns:xs="http:\/\/www\.w3\.org\/2001\/XMLSchema" xsi:type="xs:string">([^"]+)<\/ns\d+:value><ns\d+:characteristic>velocidadeContratada<\/ns\d+:characteristic><\/ns\d+:item>/,
    patternCtpVlan:
        /<ns\d+:type>CTP\.VLAN<\/ns\d+:type><ns\d+:uniqueCode>CTP\.VLAN-NS#\d*<\/ns\d+:uniqueCode><ns\d+:name>(\d*)<\/ns\d+:name>/,
    patternBloqueio:
        /<ns\d+:item\s+xsi:type="ns\d+:CharacteristicExt"><ns\d+:value\s+xmlns:xs="http:\/\/www\.w3\.org\/2001\/XMLSchema"\s+xsi:type="xs:string">([^"]+)<\/ns\d+:value><ns\d+:characteristic>bloqueio<\/ns\d+:characteristic><\/ns\d+:item>/,
    patternCtpVlanI:
        /<ns\d+:type>CTP\.VLAN\.I<\/ns\d+:type><ns\d+:uniqueCode>CTP\.VLAN\.I-NS#\d*<\/ns\d+:uniqueCode><ns\d+:name>(\d*)<\/ns\d+:name>/,
    patternCtpVlanO:
        /<ns\d+:type>CTP\.VLAN\.O<\/ns\d+:type><ns\d+:uniqueCode>CTP\.VLAN\.O-NS#\d*<\/ns\d+:uniqueCode><ns\d+:name>(\d*)<\/ns\d+:name>/,
    patternStateService: /<ns\d+:state_Service>(.*)<\/ns\d+:state_Service>/,
    patternSubscriberId:
        /<ns\d+:item\s+xsi:type="ns\d+:CharacteristicExt"><ns\d+:value\s+xmlns:xs="http:\/\/www\.w3\.org\/2001\/XMLSchema"\s+xsi:type="xs:string">([^"]+)<\/ns\d+:value><ns\d+:characteristic>subscriberId<\/ns\d+:characteristic><\/ns\d+:item>/,
    patternCompanyId:
        /<ns\d+:item\s+xsi:type="ns\d+:CharacteristicExt"><ns\d+:value\s+xmlns:xs="http:\/\/www\.w3\.org\/2001\/XMLSchema"\s+xsi:type="xs:string">([^"]+)<\/ns\d+:value><ns\d+:characteristic>companyId<\/ns\d+:characteristic><\/ns\d+:item>/,
    patternTipoLogradouro: /<tipoLogradouro>(.*)<\/tipoLogradouro>/,
    patternNomeLogradouro: /<nomeLogradouro>(.*)<\/nomeLogradouro>/,
    patternNumeroFachada: /<numeroFachada>(.*)<\/numeroFachada>/,
    patternBairro: /<bairro>(.*)<\/bairro>/,
    patternSiglaLocalidade: /<siglaLocalidade>(.*)<\/siglaLocalidade>/,
    patternDescLocalidade: /<descLocalidade>(.*)<\/descLocalidade>/,
    patternSiglaUf: /<siglaUf>(.*)<\/siglaUf>/,
    patternDescUf: /<descricaoUf>(.*)<\/descricaoUf>/,
    patternCodLocalidade: /<codLocalidade>(.*)<\/codLocalidade>/,
    patternCep: /<CEP>(.*)<\/CEP>/,
    patternErrorMessage: /<ns\d+:message>(.*)<\/ns\d+:message>/,
    patternErrorCode: /<ns\d+:errorCode>(.*)<\/ns\d+:errorCode>/,
    patternIdEndereco:
        /<ns\d+:item xsi:type="ns\d+:CharacteristicExt"><ns\d+:value xmlns:xs="http:\/\/www.w3.org\/2001\/XMLSchema" xsi:type="xs:string">([^"]+)<\/ns\d+:value><ns\d+:characteristic>idEndereco<\/ns\d+:characteristic><\/ns\d+:item>/,
    patternMunicipio:
        /<ns\d+:item xsi:type="ns\d+:CharacteristicExt"><ns\d+:value xmlns:xs="http:\/\/www.w3.org\/2001\/XMLSchema" xsi:type="xs:string">([^"]+)<\/ns\d+:value><ns\d+:characteristic>municipioSurvey<\/ns\d+:characteristic><\/ns\d+:item>/,
    patternLatitude: /<latitude>(.*)<\/latitude>/,
    patternLongitude: /<longitude>(.*)<\/longitude>/,
    patternSegment:
        /<ns\d+:item xsi:type="ns\d+:CharacteristicExt"><ns\d+:value xmlns:xs="http:\/\/www.w3.org\/2001\/XMLSchema" xsi:type="xs:string">([^"]+)<\/ns\d+:value><ns\d+:characteristic>SEGMENT<\/ns\d+:characteristic><\/ns\d+:item>/,
    patternBitstream:
        /<ns\d+:item xsi:type="ns\d+:CharacteristicExt"><ns\d+:value xmlns:xs="http:\/\/www.w3.org\/2001\/XMLSchema" xsi:type="xs:string">([^"]+)<\/ns\d+:value><ns\d+:characteristic>BITSTREAM<\/ns\d+:characteristic><\/ns\d+:item>/,
    patternSerialNumber:
        /<ns\d+:item xsi:type="ns\d+:CharacteristicExt"><ns\d+:value xmlns:xs="http:\/\/www.w3.org\/2001\/XMLSchema" xsi:type="xs:string">([^"]+)<\/ns\d+:value><ns\d+:characteristic>SERIAL_NUMBER<\/ns\d+:characteristic><\/ns\d+:item>/,
    patternGestaoOnt: /<gestaoOnt>(.*)<\/gestaoOnt>/,
    patternModelCpeEntity: /<model>(.*?)<\/model>/,
    patternFlagBloqueio:
        /<ns\d+:item xsi:type="ns\d+:CharacteristicExt"><ns\d+:value xmlns:xs="http:\/\/www\.w3\.org\/2001\/XMLSchema" xsi:type="xs:string">([^"]+)<\/ns\d+:value><ns\d+:characteristic>bloqueio<\/ns\d+:characteristic><\/ns\d+:item>/,
    patternSplitterPort:
        /<ns\d+:uniqueCode>PTP-NS#\d+<\/ns\d+:uniqueCode><ns\d+:name>(\d+)<\/ns\d+:name>/,
    patternPtpCodeO:
        /<ns\d+:type>pt.ptinovacao.ni.oss.resource.network.tp.PtpValue<\/ns\d+:type><ns\d+:primaryKey xsi:type="ns\d+:Pk"><ns\d+:type>PTP.FO.O<\/ns\d+:type><ns\d+:uniqueCode>[^<]*<\/ns\d+:uniqueCode><ns\d+:name>([^<]*)<\/ns\d+:name>/g,
    patternPtpCodeI:
        /<ns\d+:type>pt.ptinovacao.ni.oss.resource.network.tp.PtpValue<\/ns\d+:type><ns\d+:primaryKey xsi:type="ns\d+:Pk"><ns\d+:type>PTP.FO.I<\/ns\d+:type><ns\d+:uniqueCode>[^<]*<\/ns\d+:uniqueCode><ns\d+:name>([^<]*)<\/ns\d+:name>/g,
    patternReassignInventoryCode:
        /<ns\d+:uniqueCode>SRV_ORD-NS#(.+)<\/ns\d+:uniqueCode>/,
    patternNumCelulaCEOS:
        /<ns\d+:item xsi:type="ns\d+:CharacteristicExt"><ns\d+:value xmlns:xs="http:\/\/www.w3.org\/2001\/XMLSchema" xsi:type="xs:string">([^"]+)<\/ns\d+:value><ns\d+:characteristic>numCelulaCEOS<\/ns\d+:characteristic><\/ns\d+:item>/,
    patternCaboSecundarioCdo:
        /<ns\d+:item xsi:type="ns\d+:CharacteristicExt"><ns\d+:value xmlns:xs="http:\/\/www.w3.org\/2001\/XMLSchema" xsi:type="xs:string">([^"]+)<\/ns\d+:value><ns\d+:characteristic>caboSecundarioCDO<\/ns\d+:characteristic><\/ns\d+:item>/,
    patternDataAtivacaoServico:
        /<ns\d+:item xsi:type="ns\d+:CharacteristicExt"><ns\d+:value xmlns:xs="http:\/\/www.w3.org\/2001\/XMLSchema" xsi:type="xs:string">([^"]+)<\/ns\d+:value><ns\d+:characteristic>dataAtivacaoServico<\/ns\d+:characteristic><\/ns\d+:item>/,
    patternCodigoIBGEMunicipioOlt:
        /<ns\d+:item xsi:type="ns\d+:CharacteristicExt"><ns\d+:value xmlns:xs="http:\/\/www.w3.org\/2001\/XMLSchema" xsi:type="xs:string">([^"]+)<\/ns\d+:value><ns\d+:characteristic>codigoIBGEMunicipioOLT<\/ns\d+:characteristic><\/ns\d+:item>/,
    patternPortaOlt:
        /<ns\d+:item xsi:type="ns\d+:CharacteristicExt"><ns\d+:value xmlns:xs="http:\/\/www.w3.org\/2001\/XMLSchema" xsi:type="xs:string">([^"]+)<\/ns\d+:value><ns\d+:characteristic>portaOLT<\/ns\d+:characteristic><\/ns\d+:item>/,
    patternSurveySiglaAreaEstacao:
        /<ns\d+:item xsi:type="ns\d+:CharacteristicExt"><ns\d+:value xmlns:xs="http:\/\/www.w3.org\/2001\/XMLSchema" xsi:type="xs:string">([^"]+)<\/ns\d+:value><ns\d+:characteristic>siglaAreaEstacaoSurvey<\/ns\d+:characteristic><\/ns\d+:item>/,
    patternSurveyMunicipio:
        /<ns\d+:item\s+xsi:type="ns\d+:CharacteristicExt"><ns\d+:value\s+xmlns:xs="http:\/\/www\.w3\.org\/2001\/XMLSchema"\s+xsi:type="xs:string">([^"]+)<\/ns\d+:value><ns\d+:characteristic>municipioSurvey<\/ns\d+:characteristic><\/ns\d+:item>/,
    patternSurveySiglaLocalidade:
        /<ns\d+:item\s+xsi:type="ns\d+:CharacteristicExt"><ns\d+:value\s+xmlns:xs="http:\/\/www\.w3\.org\/2001\/XMLSchema"\s+xsi:type="xs:string">([^"]+)<\/ns\d+:value><ns\d+:characteristic>siglaLocalidadeSurvey<\/ns\d+:characteristic><\/ns\d+:item>/,
    patternSurveySiglaUf:
        /<ns\d+:item\s+xsi:type="ns\d+:CharacteristicExt"><ns\d+:value\s+xmlns:xs="http:\/\/www\.w3\.org\/2001\/XMLSchema"\s+xsi:type="xs:string">([^"]+)<\/ns\d+:value><ns\d+:characteristic>siglaUFSurvey<\/ns\d+:characteristic><\/ns\d+:item>/,
    patternSurveyCnl:
        /<ns\d+:item xsi:type="ns\d+:CharacteristicExt"><ns\d+:value xmlns:xs="http:\/\/www\.w3\.org\/2001\/XMLSchema" xsi:type="xs:string">([^"]+)<\/ns\d+:value><ns\d+:characteristic>cnlSurvey<\/ns\d+:characteristic><\/ns\d+:item>/,
    patternSurveyCodigoIBGEMunicipio:
        /<ns\d+:item xsi:type="ns\d+:CharacteristicExt"><ns\d+:value xmlns:xs="http:\/\/www\.w3\.org\/2001\/XMLSchema" xsi:type="xs:string">([^"]+)<\/ns\d+:value><ns\d+:characteristic>codigoIBGEMunicipioSurvey<\/ns\d+:characteristic><\/ns\d+:item>/,
    patternCnlOlt:
        /<ns\d+:item xsi:type="ns\d+:CharacteristicExt"><ns\d+:value xmlns:xs="http:\/\/www\.w3\.org\/2001\/XMLSchema" xsi:type="xs:string">([^"]+)<\/ns\d+:value><ns\d+:characteristic>cnlOLT<\/ns\d+:characteristic><\/ns\d+:item>/,
    patternPrimaryCable:
        /<ns\d+:item xsi:type="ns\d+:CharacteristicExt"><ns\d+:value xmlns:xs="http:\/\/www\.w3\.org\/2001\/XMLSchema" xsi:type="xs:string">([^"]+)<\/ns\d+:value><ns\d+:characteristic>caboPrimario<\/ns\d+:characteristic><\/ns\d+:item>/,
    patternSecondaryCable:
        /<ns\d+:item xsi:type="ns\d+:CharacteristicExt"><ns\d+:value xmlns:xs="http:\/\/www\.w3\.org\/2001\/XMLSchema" xsi:type="xs:string">([^"]+)<\/ns\d+:value><ns\d+:characteristic>caboSecundario<\/ns\d+:characteristic><\/ns\d+:item>/,
    patternOntOperationalState:
        /<ns\d+:state_Service>(.*)<\/ns\d+:state_Service>/,
    patternCpeEntityHardwareIdOnt:
        /<cpeEntity>.*<hardwareIdOnt>(.*)<\/hardwareIdOnt>.*<\/cpeEntity>/,
    patternCpeEntityModel: /<cpeEntity>.*<model>(.*)<\/model>.*<\/cpeEntity>/,
    patternCpeEntityManufacturer:
        /<cpeEntity>.*<manufacturer>(.*)<\/manufacturer>.*<\/cpeEntity>/,
    patternCpeEntityServiceTag:
        /<cpeEntity>.*<serviceTag>(.*)<\/serviceTag>.*<\/cpeEntity>/,
    patternCpeEntityFirmware:
        /<cpeEntity>.*<firmware>(.*)<\/firmware>.*<\/cpeEntity>/,
    patternCpeEntityGestaoOnt:
        /<cpeEntity>.*<gestaoOnt>(.*)<\/gestaoOnt>.*<\/cpeEntity>/,
    patternCpeEntitySerialNumber:
        /<cpeEntity>.*<serialNumber>(.*)<\/serialNumber>.*<\/cpeEntity>/,
    patternCpeEntitySapNumber:
        /<cpeEntity>.*<sapNumber>(.*)<\/sapNumber>.*<\/cpeEntity>/,
    patternCdoAddressType: /<enderecoCdo>.*<type>(.*)<\/type>.*<\/enderecoCdo>/,
    patternCdoAddressUniqueCode:
        /<enderecoCdo>.*<uniqueCode>(.*)<\/uniqueCode>.*<\/enderecoCdo>/,
    patternCdoAddressName: /<enderecoCdo>.*<name>(.*)<\/name>.*<\/enderecoCdo>/,
    patternCdoAddressAddress:
        /<enderecoCdo>.*<address>(.*)<\/address>.*<\/enderecoCdo>/,
    patternCdoAddressLatitude:
        /<enderecoCdo>.*<latitude>(.*)<\/latitude>.*<\/enderecoCdo>/,
    patternCdoAddressLongitude:
        /<enderecoCdo>.*<longitude>(.*)<\/longitude>.*<\/enderecoCdo>/,
} as const;

export type NetwinPatterns =
    (typeof NetwinPatterns)[keyof typeof NetwinPatterns];

export const getMatchByNetwinPattern = (
    data: string,
    pattern: NetwinPatterns,
): string[] => {
    return data?.match(pattern)?.splice(1) || [];
};
