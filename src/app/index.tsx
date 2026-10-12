import { Redirect } from 'expo-router';

/** Root index redirects into the tab shell. */
export default function Index() {
  return <Redirect href="/(tabs)" />;
}
