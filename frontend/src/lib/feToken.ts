/** User-visible copy for blocked token generation on rejected tickets */
export const FE_TICKET_REJECTED_MESSAGE = 'Ticket rejected — action not allowed';

interface GenerateFEActionTokenParams {
  ticketId: string;
  feId: string;
  actionType: 'ON_SITE' | 'RESOLUTION';
  expiryHours?: number;
}

/**
 * @deprecated FE action tokens must be created via backend assignment / ticket APIs.
 */
export async function generateFEActionToken(_params: GenerateFEActionTokenParams): Promise<never> {
  void _params;
  throw new Error(
    'Client-side token creation is disabled. Tokens are issued by the backend when assigning field executives or via admin tools.'
  );
}
