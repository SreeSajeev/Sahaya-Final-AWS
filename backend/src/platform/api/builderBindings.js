/**
 * Re-exports builder services for the platform API router.
 */
export {
  workflowService,
  assignmentRulesService,
  notificationsService,
  reportsService,
  dashboardsService,
  automationsService,
  aiConfigService,
  pluginsService,
  upsertEmailParser,
  upsertPermission,
  listPermissions,
} from "../runtime/builderServices.js";
