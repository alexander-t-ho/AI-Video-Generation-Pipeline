/**
 * Shared API Middleware
 * Common validation, authentication, and error handling utilities for API routes
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSession, checkProjectAccess } from '@/lib/auth/auth-utils';

// ============================================================================
// Types
// ============================================================================

export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  code?: string;
  retryable?: boolean;
}

export interface ValidationRule {
  field: string;
  type: 'string' | 'number' | 'boolean' | 'array' | 'object';
  required?: boolean;
  min?: number;
  max?: number;
  pattern?: RegExp;
  custom?: (value: any) => string | null;
}

// ============================================================================
// Validation Utilities
// ============================================================================

/**
 * Validates request body against rules
 */
export function validateRequest(body: any, rules: ValidationRule[]): string | null {
  if (!body || typeof body !== 'object') {
    return 'Request body is required';
  }

  for (const rule of rules) {
    const value = body[rule.field];

    // Check required
    if (rule.required && (value === undefined || value === null || value === '')) {
      return `Missing required field: ${rule.field}`;
    }

    // Skip further validation if not required and not present
    if (!rule.required && (value === undefined || value === null)) {
      continue;
    }

    // Type validation
    const actualType = Array.isArray(value) ? 'array' : typeof value;
    if (actualType !== rule.type) {
      return `Invalid type for ${rule.field}: expected ${rule.type}, got ${actualType}`;
    }

    // String validations
    if (rule.type === 'string') {
      if (typeof value === 'string') {
        if (rule.min !== undefined && value.length < rule.min) {
          return `${rule.field} must be at least ${rule.min} characters`;
        }
        if (rule.max !== undefined && value.length > rule.max) {
          return `${rule.field} must be at most ${rule.max} characters`;
        }
        if (rule.pattern && !rule.pattern.test(value)) {
          return `${rule.field} has invalid format`;
        }
      }
    }

    // Number validations
    if (rule.type === 'number') {
      if (typeof value === 'number') {
        if (rule.min !== undefined && value < rule.min) {
          return `${rule.field} must be at least ${rule.min}`;
        }
        if (rule.max !== undefined && value > rule.max) {
          return `${rule.field} must be at most ${rule.max}`;
        }
      }
    }

    // Array validations
    if (rule.type === 'array') {
      if (Array.isArray(value)) {
        if (rule.min !== undefined && value.length < rule.min) {
          return `${rule.field} must have at least ${rule.min} items`;
        }
        if (rule.max !== undefined && value.length > rule.max) {
          return `${rule.field} must have at most ${rule.max} items`;
        }
      }
    }

    // Custom validation
    if (rule.custom) {
      const error = rule.custom(value);
      if (error) return error;
    }
  }

  return null;
}

/**
 * Validates URL format
 */
export function validateUrl(url: string, allowLocal: boolean = false): boolean {
  if (allowLocal && (url.startsWith('/') || url.startsWith('./'))) {
    return true;
  }
  return url.startsWith('http://') || url.startsWith('https://');
}

// ============================================================================
// Authentication Utilities
// ============================================================================

/**
 * Checks authentication and returns session
 */
export async function requireAuth(req: NextRequest): Promise<{ session: any; error?: NextResponse }> {
  const session = await getSession();
  
  if (!session?.user?.id) {
    return {
      session: null,
      error: NextResponse.json(
        { success: false, error: 'Unauthorized', code: 'UNAUTHORIZED' } as ApiResponse,
        { status: 401 }
      ),
    };
  }

  return { session };
}

/**
 * Checks project access
 */
export async function requireProjectAccess(
  userId: string,
  projectId: string
): Promise<{ hasAccess: boolean; error?: NextResponse }> {
  const hasAccess = await checkProjectAccess(userId, projectId);
  
  if (!hasAccess) {
    return {
      hasAccess: false,
      error: NextResponse.json(
        { success: false, error: 'Forbidden', code: 'FORBIDDEN' } as ApiResponse,
        { status: 403 }
      ),
    };
  }

  return { hasAccess: true };
}

// ============================================================================
// Error Handling
// ============================================================================

/**
 * Creates standardized error response
 */
export function createErrorResponse(
  error: any,
  defaultMessage: string = 'An error occurred'
): NextResponse<ApiResponse> {
  console.error('[API Error]', error);

  const message = error?.message || defaultMessage;
  const code = error?.code || 'INTERNAL_ERROR';
  const retryable = error?.retryable || false;

  let statusCode = 500;
  if (code === 'INVALID_REQUEST' || code === 'VALIDATION_ERROR') {
    statusCode = 400;
  } else if (code === 'UNAUTHORIZED') {
    statusCode = 401;
  } else if (code === 'FORBIDDEN') {
    statusCode = 403;
  } else if (code === 'NOT_FOUND') {
    statusCode = 404;
  } else if (code === 'RATE_LIMIT') {
    statusCode = 429;
  } else if (retryable) {
    statusCode = 503;
  }

  return NextResponse.json(
    {
      success: false,
      error: message,
      code,
      retryable,
    } as ApiResponse,
    { status: statusCode }
  );
}

/**
 * Creates standardized success response
 */
export function createSuccessResponse<T>(
  data: T,
  status: number = 200
): NextResponse<ApiResponse<T>> {
  return NextResponse.json(
    {
      success: true,
      data,
    } as ApiResponse<T>,
    { status }
  );
}

// ============================================================================
// Request Parsing
// ============================================================================

/**
 * Safely parses JSON request body
 */
export async function parseRequestBody<T = any>(req: NextRequest): Promise<{ body: T; error?: NextResponse }> {
  try {
    const body = await req.json();
    return { body };
  } catch (error) {
    return {
      body: null as any,
      error: NextResponse.json(
        {
          success: false,
          error: 'Invalid JSON in request body',
          code: 'INVALID_REQUEST',
        } as ApiResponse,
        { status: 400 }
      ),
    };
  }
}

// ============================================================================
// Environment Checks
// ============================================================================

/**
 * Checks required environment variables
 */
export function checkEnvVars(vars: string[]): string | null {
  for (const varName of vars) {
    if (!process.env[varName]) {
      return `${varName} environment variable is not set`;
    }
  }
  return null;
}

// ============================================================================
// Common Validation Rules
// ============================================================================

export const commonRules = {
  projectId: {
    field: 'projectId',
    type: 'string' as const,
    required: true,
    min: 1,
  },
  sceneIndex: {
    field: 'sceneIndex',
    type: 'number' as const,
    required: true,
    min: 0,
  },
  prompt: {
    field: 'prompt',
    type: 'string' as const,
    required: true,
    min: 1,
  },
  imageUrl: {
    field: 'imageUrl',
    type: 'string' as const,
    required: true,
    custom: (value: string) => {
      if (!validateUrl(value)) {
        return 'imageUrl must be a valid HTTP/HTTPS URL';
      }
      return null;
    },
  },
};

