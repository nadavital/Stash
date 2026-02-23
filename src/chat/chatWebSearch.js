export function createBuildChatWebSearchTool(config, buildWebSearchTool) {
  return function buildChatWebSearchTool(allowedDomains = []) {
    if (!config.openaiWebSearchEnabled) return null;
    return buildWebSearchTool({
      allowedDomains,
      type: config.openaiWebSearchToolType,
      searchContextSize: config.openaiWebSearchContextSize,
      externalWebAccess: config.openaiWebSearchExternalAccess,
      userLocation: {
        country: config.openaiWebSearchUserCountry,
        city: config.openaiWebSearchUserCity,
        region: config.openaiWebSearchUserRegion,
        timezone: config.openaiWebSearchUserTimezone,
      },
    });
  };
}
