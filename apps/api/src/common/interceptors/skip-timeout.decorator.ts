import { SetMetadata } from '@nestjs/common';

export const SKIP_TIMEOUT_KEY = 'skipRequestTimeout';

/**
 * Exempt a route from the global request timeout (TimeoutInterceptor).
 * Use for genuinely long-running streaming endpoints — file uploads/downloads —
 * where the blanket JSON-request timeout would abort a legitimate transfer.
 */
export const SkipTimeout = () => SetMetadata(SKIP_TIMEOUT_KEY, true);
