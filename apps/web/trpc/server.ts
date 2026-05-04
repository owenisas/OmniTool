import "server-only";
import { headers } from "next/headers";
import { createTRPCContext } from "./init";
import { appRouter } from "./routers/_app";

export async function serverTrpc() {
  const reqHeaders = await headers();
  const ctx = await createTRPCContext({ headers: reqHeaders });
  return appRouter.createCaller(ctx);
}
