export type RecipientSource = "client_user" | "org_fallback" | "missing";

export type RecipientResolution = {
  email: string;
  source: RecipientSource;
  canSend: boolean;
  blockReason?: string;
};

type ClientRecipientInput = {
  users?: Array<{ email: string | null }>;
  org?: { contactEmail: string | null } | null;
};

export function resolveRecipient(client: ClientRecipientInput | null | undefined): RecipientResolution {
  if (!client) {
    return {
      email: "sin-correo",
      source: "missing",
      canSend: false,
      blockReason: "missing_client",
    };
  }

  const userEmail =
    client.users
      ?.map((user) => user.email?.trim())
      .find((email) => Boolean(email)) ?? null;

  if (userEmail) {
    return {
      email: userEmail,
      source: "client_user",
      canSend: true,
    };
  }

  const orgEmail = client.org?.contactEmail?.trim() ?? null;
  if (orgEmail) {
    return {
      email: orgEmail,
      source: "org_fallback",
      canSend: false,
      blockReason: "missing_tenant_email",
    };
  }

  return {
    email: "sin-correo",
    source: "missing",
    canSend: false,
    blockReason: "missing_email",
  };
}
