import { createMiddleware, initChatModel } from "langchain";
import { RuntimeConfigClient, resolveModelId, normalizeBaseUrl } from "../model/runtime-config.js";
import { agentEnv } from "../env.js";

export function createModelRuntimeMiddleware(
  rcClient = new RuntimeConfigClient(agentEnv.BACKEND_API_URL),
) {
  return createMiddleware({
    name: "ModelRuntime",

    wrapModelCall: async (request, handler) => {
      const configurable = request.runtime.configurable as Record<string, unknown> | undefined;
      const modelId = resolveModelId(agentEnv.FEEDMIND_MODEL, configurable);

      if (!modelId) return handler(request);

      const runtimeConfig = await rcClient.getRuntimeConfig(modelId, request.runtime.signal);

      const cleanModelName = runtimeConfig.model_name.split(":").slice(1).join(":") || runtimeConfig.model_name;

      const model = await initChatModel(cleanModelName, {
        modelProvider: "openai",
        configurableFields: [],
        configuration: (() => {
          const url = normalizeBaseUrl(runtimeConfig.base_url);
          return url ? { baseURL: url } : {};
        })(),
        apiKey: runtimeConfig.api_key || agentEnv.OPENAI_COMPATIBLE_API_KEY || "not-set",
        temperature: agentEnv.FEEDMIND_TEMPERATURE,
      });

      return handler({ ...request, model });
    },
  });
}
