import { isTokensNotFoundError } from "./tokens-client";

export function publicAssetError(error: unknown, unavailableMessage: string) {
  if (isTokensNotFoundError(error)) {
    return { status: 404, error: "This asset does not exist" } as const;
  }
  return { status: 502, error: unavailableMessage } as const;
}
