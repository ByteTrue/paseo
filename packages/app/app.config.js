const pkg = require("./package.json");

export default {
  expo: {
    name: "Paseo",
    slug: "voice-mobile",
    version: pkg.version,
    icon: "./assets/images/icon.png",
    scheme: "paseo",
    userInterfaceStyle: "automatic",
    web: {
      output: "single",
      favicon: "./assets/images/favicon.png",
    },
    autolinking: {
      searchPaths: ["../../node_modules", "./node_modules"],
    },
    plugins: ["expo-router"],
    experiments: {
      typedRoutes: true,
      reactCompiler: true,
      autolinkingModuleResolution: true,
    },
    extra: {
      router: {},
    },
  },
};
