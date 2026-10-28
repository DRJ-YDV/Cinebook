import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { setupRouterSsrQueryIntegration } from "@tanstack/react-router-ssr-query";
import { routeTree } from "./routeTree.gen";

export const getRouter = () => {
  const queryClient = new QueryClient();

  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    defaultPreloadStaleTime: 0,
  });

  // RootComponent already provides this exact client. Connect SSR/hydration without
  // adding a second provider or a process-global cache of private data.
  setupRouterSsrQueryIntegration({ router, queryClient, wrapQueryClient: false });
  return router;
};
