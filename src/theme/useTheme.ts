import { useColorScheme } from 'react-native';
import { darkTheme, lightTheme, type ThemeTokens } from './tokens';

export function useAppTheme(): ThemeTokens {
  const scheme = useColorScheme();
  return scheme === 'dark' ? darkTheme : lightTheme;
}
