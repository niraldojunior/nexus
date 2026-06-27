import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
    IsBoolean,
    IsDefined,
    IsEnum,
    IsNotEmpty,
    IsOptional,
    IsString,
} from 'class-validator';

import { CompressAlgorithm } from '@/shared/application/port/compress/compress.repository';
import { trimHbsUtil } from '@/shared/util/handlebars.util';

class UtilsFormatOptionsRequestDto {
    @ApiProperty({
        name: 'filetype',
        description: 'File type to be formatted',
        example: 'hbs',
        examples: ['hbs'],
        required: false,
    })
    @IsString()
    filetype: string;
}

class UtilsFormatCompressionRequestDto {
    @ApiProperty({
        name: 'enabled',
        description: 'Compression information',
        example: false,
        examples: [true, false],
        required: false,
    })
    @IsBoolean()
    @IsOptional()
    enabled?: boolean;

    @ApiProperty({
        name: 'algorithm',
        description: 'Compression information',
        example: CompressAlgorithm.UTF16,
        examples: Object.values(CompressAlgorithm),
        required: false,
    })
    @IsEnum(CompressAlgorithm)
    @IsOptional()
    algorithm?: CompressAlgorithm;
}

export class UtilCodeFormatRequestDto {
    @ApiProperty({
        name: 'data',
        description: 'String to be formatted',
        example: trimHbsUtil(`
            {
             "user": {
               "id": "{{usuario.id}}",
               "fullName": "{{usuario.nome}} {{usuario.sobrenome}}",
               "contact": {
                 "email": "{{extract usuario 'contato.email'}}",
                 "phone": "{{extract usuario 'contato.telefone'}}"
               },
               "birthDate": "{{formatDate usuario.data_nascimento}}"
             },
             "products": {
               {{#each produtos}}
               "{{id}}": {
                 "name": "{{nome}}",
                 "price": {{preco}},
                 "category": "{{categoria.nome}}"
               }{{#unless @last}},{{/unless}}
               {{/each}}
             },
             "summary": {
               "totalProducts": {{produtos.length}},
               "categories": [
                 {{#each (unique produtos "categoria.nome")}}
                 "{{this}}"{{#unless @last}},{{/unless}}
                 {{/each}}
               ]
             }
            }`),
        required: true,
    })
    @IsString()
    @IsNotEmpty()
    data: string;

    @ApiProperty({
        name: 'options',
        description: 'Options for formatting',
        required: false,
    })
    @Type(() => UtilsFormatOptionsRequestDto)
    @IsDefined()
    options: UtilsFormatOptionsRequestDto;

    @ApiProperty({
        name: 'compression',
        description: 'Indicates if the input data is compressed',
        required: false,
    })
    @Type(() => UtilsFormatCompressionRequestDto)
    @IsOptional()
    compression: UtilsFormatCompressionRequestDto;
}
