import type { Provider } from '@omnisync/shared';

export type ConnectionVM = {
  id: string;
  provider: Provider;
  handle: string | null;
  status: string;
};
