import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

import { trimXmlBody } from '@/shared/util/xml.util';

export class UtilXmlToJsonRequestDto {
    @ApiProperty({
        name: 'data',
        description: 'String to be converted',
        example: trimXmlBody(`
            <SOAP-ENV:Envelope xmlns:pfx21="http://www.ptinovacao.pt/netwin/xml/query/query-so-cfs-rfs-parent-resorces/v1-0"
                    xmlns:SOAP-ENV="http://schemas.xmlsoap.org/soap/envelope/">
                <SOAP-ENV:Body xmlns:SOAP-ENV="http://schemas.xmlsoap.org/soap/envelope/">
                    <ns0:queryRequest xmlns:n0="FTTHInventoryInterface" xmlns:ns0="http://ossj.org/xml/Common/v1-5" xmlns:pfx21="http://www.ptinovacao.pt/netwin/xml/query/query-so-cfs-rfs-parent-resorces/v1-0">
                        <ns0:namedQuery ns1:type="pfx21:QuerySOrdCfsRfsParentResourcesClientValue" xmlns:ns1="http://www.w3.org/2001/XMLSchema-instance">
                            <companyId>CC9999</companyId>
                            <subscriberId>A00000NZ4</subscriberId>
                        </ns0:namedQuery>
                    </ns0:queryRequest>
                </SOAP-ENV:Body>
                <v1:eMessageIdentifier xmlns:v1="http://www.ptinovacao.pt/netwin/xml/messaging/v1-0"/>
            </SOAP-ENV:Envelope>`),
        required: true,
    })
    @IsString()
    @IsNotEmpty()
    data: string;
}
