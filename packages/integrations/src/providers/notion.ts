import { Client } from "@notionhq/client";
import { refreshTokenIfNeeded } from "../lib/token-refresh";

export async function createNotionClient(userId: string): Promise<Client> {
  const token = await refreshTokenIfNeeded(userId, "NOTION");
  return new Client({ auth: token });
}

export async function searchNotionPages(client: Client, query: string) {
  const response = await client.search({
    query,
    filter: { value: "page", property: "object" },
    page_size: 20,
  });
  return response.results;
}

export async function getNotionDatabases(client: Client) {
  const response = await client.search({
    filter: { value: "database", property: "object" },
    page_size: 50,
  });
  return response.results;
}
