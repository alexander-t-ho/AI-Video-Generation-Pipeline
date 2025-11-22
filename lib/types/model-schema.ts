/**
 * Type definitions for Replicate model input schemas
 * 
 * These types match the JSON Schema format used by Replicate's OpenAPI schemas
 */

/**
 * JSON Schema property types
 */
export type SchemaPropertyType = 'string' | 'number' | 'integer' | 'boolean' | 'array' | 'object' | 'null';

/**
 * JSON Schema format hints
 */
export type SchemaFormat = 'uri' | 'email' | 'date-time' | 'date' | 'time' | 'binary';

/**
 * Model parameter definition
 * Represents a single input parameter for a model
 */
export interface ModelParameter {
  type: SchemaPropertyType | SchemaPropertyType[];
  title?: string;
  description?: string;
  default?: any;
  enum?: any[];
  format?: SchemaFormat;
  minimum?: number;
  maximum?: number;
  minLength?: number;
  maxLength?: number;
  items?: ModelParameter; // For array types
  properties?: Record<string, ModelParameter>; // For object types
  required?: string[]; // For object types
  nullable?: boolean;
  'x-order'?: number; // Custom field for ordering in UI
  examples?: any[];
  pattern?: string; // For string validation
}

/**
 * Model input schema
 * Represents the complete input schema for a model
 */
export interface ModelInputSchema {
  type: 'object';
  title?: string;
  properties: Record<string, ModelParameter>;
  required?: string[];
  additionalProperties?: boolean;
}

/**
 * Normalized parameter value
 * Used for form state and validation
 */
export type ParameterValue = 
  | string 
  | number 
  | boolean 
  | string[] 
  | null 
  | undefined;

/**
 * Model parameters object
 * Key-value pairs of parameter names to their values
 */
export interface ModelParameters {
  [key: string]: ParameterValue;
}

/**
 * Parameter validation result
 */
export interface ParameterValidationResult {
  valid: boolean;
  errors: string[];
}

/**
 * Helper function to check if a parameter is required
 */
export function isParameterRequired(
  paramName: string,
  schema: ModelInputSchema
): boolean {
  return schema.required?.includes(paramName) ?? false;
}

/**
 * Helper function to get parameter default value
 */
export function getParameterDefault(
  paramName: string,
  schema: ModelInputSchema
): any {
  const param = schema.properties[paramName];
  return param?.default;
}

/**
 * Helper function to check if parameter is nullable
 */
export function isParameterNullable(
  paramName: string,
  schema: ModelInputSchema
): boolean {
  const param = schema.properties[paramName];
  if (!param) return false;
  
  // Check if type includes 'null' or nullable is true
  if (Array.isArray(param.type)) {
    return param.type.includes('null');
  }
  return param.nullable === true;
}

/**
 * Helper function to validate a parameter value against its schema
 */
export function validateParameterValue(
  paramName: string,
  value: ParameterValue,
  schema: ModelInputSchema
): ParameterValidationResult {
  const errors: string[] = [];
  const param = schema.properties[paramName];
  
  if (!param) {
    return { valid: false, errors: [`Unknown parameter: ${paramName}`] };
  }

  // Check required
  if (isParameterRequired(paramName, schema) && (value === null || value === undefined || value === '')) {
    errors.push(`${paramName} is required`);
    return { valid: false, errors };
  }

  // If value is null/undefined and parameter is nullable or optional, it's valid
  if ((value === null || value === undefined) && (isParameterNullable(paramName, schema) || !isParameterRequired(paramName, schema))) {
    return { valid: true, errors: [] };
  }

  // Type validation
  const paramType = Array.isArray(param.type) ? param.type.filter(t => t !== 'null')[0] : param.type;
  
  if (paramType === 'string') {
    if (typeof value !== 'string') {
      errors.push(`${paramName} must be a string`);
    } else {
      if (param.minLength !== undefined && value.length < param.minLength) {
        errors.push(`${paramName} must be at least ${param.minLength} characters`);
      }
      if (param.maxLength !== undefined && value.length > param.maxLength) {
        errors.push(`${paramName} must be at most ${param.maxLength} characters`);
      }
      if (param.pattern && !new RegExp(param.pattern).test(value)) {
        errors.push(`${paramName} does not match required pattern`);
      }
      if (param.format === 'uri' && !value.startsWith('http://') && !value.startsWith('https://')) {
        errors.push(`${paramName} must be a valid URI`);
      }
    }
  } else if (paramType === 'number' || paramType === 'integer') {
    if (typeof value !== 'number') {
      errors.push(`${paramName} must be a number`);
    } else {
      if (param.minimum !== undefined && value < param.minimum) {
        errors.push(`${paramName} must be at least ${param.minimum}`);
      }
      if (param.maximum !== undefined && value > param.maximum) {
        errors.push(`${paramName} must be at most ${param.maximum}`);
      }
    }
  } else if (paramType === 'boolean') {
    if (typeof value !== 'boolean') {
      errors.push(`${paramName} must be a boolean`);
    }
  } else if (paramType === 'array') {
    if (!Array.isArray(value)) {
      errors.push(`${paramName} must be an array`);
    }
  }

  // Enum validation
  if (param.enum && !param.enum.includes(value)) {
    errors.push(`${paramName} must be one of: ${param.enum.join(', ')}`);
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Validate all parameters against schema
 */
export function validateModelParameters(
  parameters: ModelParameters,
  schema: ModelInputSchema
): ParameterValidationResult {
  const errors: string[] = [];

  // Check required parameters
  for (const requiredParam of schema.required || []) {
    if (!(requiredParam in parameters) || parameters[requiredParam] === null || parameters[requiredParam] === undefined) {
      errors.push(`Required parameter missing: ${requiredParam}`);
    }
  }

  // Validate each provided parameter
  for (const [paramName, value] of Object.entries(parameters)) {
    const validation = validateParameterValue(paramName, value, schema);
    if (!validation.valid) {
      errors.push(...validation.errors);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}



