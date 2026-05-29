import path from "node:path";
import { fileURLToPath } from "node:url";
import { mergeConfig } from "vite";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const config = {
  stories: ["../src/**/*.stories.@(js|jsx|ts|tsx|mdx)"],
  addons: ["@storybook/addon-docs", "@storybook/addon-a11y"],
  framework: {
    name: "@storybook/react-vite",
    options: {},
  },
  async viteFinal(config) {
    return mergeConfig(config, {
      resolve: {
        alias: {
          "@": path.resolve(__dirname, "../src"),
        },
      },
    });
  },
};

export default config;
