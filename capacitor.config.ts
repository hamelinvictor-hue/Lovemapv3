import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.lovemap.duo',
  appName: 'react-example',
  webDir: 'dist',
  plugins: {
    FirebaseFirestore: {
      databaseId: 'ai-studio-lovemapmomentsli-43d3bd8e-58f2-4435-8c33-1d088f0ab47a',
    },
  },
};

export default config;
