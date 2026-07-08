export type JsonSchema =
  | {
      type: 'object';
      description?: string;
      properties?: Record<string, JsonSchema>;
      required?: string[];
      additionalProperties?: boolean;
    }
  | {
      type: 'array';
      description?: string;
      items: JsonSchema;
    }
  | {
      type: 'string' | 'number' | 'integer' | 'boolean' | 'null';
      description?: string;
      enum?: Array<string | number | boolean | null>;
    };

export type JsonSchemaValidationError = {
  path: string;
  message: string;
};

export const validateJsonSchema = (
  value: unknown,
  schema: JsonSchema,
  path = '$',
): JsonSchemaValidationError[] => {
  if (schema.type === 'null') {
    return value === null ? [] : [{ path, message: 'expected null' }];
  }

  if (schema.type === 'string') {
    if (typeof value !== 'string') {
      return [{ path, message: 'expected string' }];
    }
    if (schema.enum && !schema.enum.includes(value)) {
      return [{ path, message: `expected one of: ${schema.enum.join(', ')}` }];
    }
    return [];
  }

  if (schema.type === 'number') {
    if (typeof value !== 'number' || Number.isNaN(value)) {
      return [{ path, message: 'expected number' }];
    }
    if (schema.enum && !schema.enum.includes(value)) {
      return [{ path, message: `expected one of: ${schema.enum.join(', ')}` }];
    }
    return [];
  }

  if (schema.type === 'integer') {
    if (typeof value !== 'number' || !Number.isInteger(value)) {
      return [{ path, message: 'expected integer' }];
    }
    if (schema.enum && !schema.enum.includes(value)) {
      return [{ path, message: `expected one of: ${schema.enum.join(', ')}` }];
    }
    return [];
  }

  if (schema.type === 'boolean') {
    if (typeof value !== 'boolean') {
      return [{ path, message: 'expected boolean' }];
    }
    if (schema.enum && !schema.enum.includes(value)) {
      return [{ path, message: `expected one of: ${schema.enum.join(', ')}` }];
    }
    return [];
  }

  if (schema.type === 'array') {
    if (!Array.isArray(value)) {
      return [{ path, message: 'expected array' }];
    }
    return value.flatMap((item, index) => validateJsonSchema(item, schema.items, `${path}[${index}]`));
  }

  if (schema.type !== 'object') {
    return [{ path, message: `unsupported schema type: ${schema.type}` }];
  }

  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return [{ path, message: 'expected object' }];
  }

  const objectValue = value as Record<string, unknown>;
  const errors: JsonSchemaValidationError[] = [];
  for (const requiredKey of schema.required ?? []) {
    if (!(requiredKey in objectValue)) {
      errors.push({ path: `${path}.${requiredKey}`, message: 'is required' });
    }
  }

  const properties: Record<string, JsonSchema> = schema.properties ?? {};
  for (const [key, propertySchema] of Object.entries(properties)) {
    if (!(key in objectValue)) continue;
    errors.push(...validateJsonSchema(objectValue[key], propertySchema, `${path}.${key}`));
  }

  if (schema.additionalProperties === false) {
    for (const key of Object.keys(objectValue)) {
      if (!(key in properties)) {
        errors.push({ path: `${path}.${key}`, message: 'unexpected property' });
      }
    }
  }

  return errors;
};
