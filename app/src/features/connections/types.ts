import type { Provider } from '@omnisync/shared';

export type ConnectionVM = {
  id: string;
  provider: Provider;
  handle: string | null;
  status: string;
  // 'scrape' = public-link source (monitor only); others are publishable.
  connector_type: string;
};
