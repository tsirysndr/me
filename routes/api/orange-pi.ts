import { getOrangePiTrack } from "../../lib/orangePi.server.ts";

export const handler = async (_request: Request): Promise<Response> => {
  return Response.json(await getOrangePiTrack(), {
    headers: { "Cache-Control": "no-store" },
  });
};
