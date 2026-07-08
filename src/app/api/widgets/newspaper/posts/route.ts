import type { NextRequest } from "next/server";
import { handleNewspaperPostsRequest } from "./handler";

export async function GET(req: NextRequest): Promise<Response> {
  return handleNewspaperPostsRequest(new URL(req.url));
}
