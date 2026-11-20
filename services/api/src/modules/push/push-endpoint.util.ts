import { PUSH_ENDPOINT_HOST_SUFFIXES } from './push.constants';

/** True only for an https URL on the default port whose host is one of the known browser push services. */
export function isAllowedPushEndpoint(endpoint: string): boolean {
  let url: URL;
  try {
    url = new URL(endpoint);
  } catch {
    return false;
  }
  if (url.protocol !== 'https:' || url.port !== '' || url.username !== '' || url.password !== '') return false;
  const host = url.hostname.toLowerCase();
  return PUSH_ENDPOINT_HOST_SUFFIXES.some((suffix) => host === suffix || host.endsWith(`.${suffix}`));
}
