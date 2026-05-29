import React from "react";

import AccountStatusCard from "./AccountStatusCard.jsx";
import "../index.css";

const meta = {
  title: "Account/StatusCard",
  component: AccountStatusCard,
};

export default meta;

export const SignedOut = {
  args: {
    authUser: null,
  },
};

export const SignedIn = {
  args: {
    authUser: {
      email: "candidate@example.com",
    },
    onSignOut: () => {},
  },
};
