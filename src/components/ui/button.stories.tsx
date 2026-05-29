import type { Meta, StoryObj } from "@storybook/react-vite";

import { Button } from "./button";

const meta = {
  title: "UI/Button",
  component: Button,
  args: {
    children: "Save changes",
  },
  argTypes: {
    variant: {
      control: "select",
      options: ["default", "outline", "secondary", "ghost", "destructive", "link"],
    },
    size: {
      control: "select",
      options: ["default", "xs", "sm", "lg", "icon", "icon-xs", "icon-sm", "icon-lg"],
    },
  },
} satisfies Meta<typeof Button>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Outline: Story = {
  args: {
    variant: "outline",
  },
};

export const Destructive: Story = {
  args: {
    variant: "destructive",
    children: "Delete draft",
  },
};
