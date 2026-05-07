type FontVariable = {
  variable: string;
};

// Keep the app boot fully local. next/font/google fetches remote CSS during
// dev/build and can leave Next stuck at "Starting..." when the network is slow
// or blocked. The CSS fallbacks in globals.css provide the actual fonts.
export const inter = { variable: '' } satisfies FontVariable;
export const mono = { variable: '' } satisfies FontVariable;
export const harmony = { variable: '' } satisfies FontVariable;
export const lxgw = { variable: '' } satisfies FontVariable;
