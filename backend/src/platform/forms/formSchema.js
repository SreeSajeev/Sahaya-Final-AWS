/**
 * Compatibility shim — prefer form-engine for new code.
 */
export {
  FORM_FIELD_TYPES as PLATFORM_FIELD_TYPES,
  validateFormDefinition as validateFormSchema,
  FIELD_CAPABILITY_FLAGS,
} from "../form-engine/index.js";
