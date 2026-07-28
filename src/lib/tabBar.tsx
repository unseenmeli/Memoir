import {
  createContext,
  useCallback,
  useContext,
  useState,
  type ReactNode,
} from "react";

type TabBarContextValue = {
  hidden: boolean;
  setHidden: (hidden: boolean) => void;
};

const TabBarContext = createContext<TabBarContextValue | null>(null);

/**
 * Lets a screen hide the bottom tab bar (e.g. full-screen map) without the
 * tab layout losing its computed height/colors — it just toggles `display`.
 */
export function TabBarProvider({ children }: { children: ReactNode }) {
  const [hidden, setHiddenState] = useState(false);
  const setHidden = useCallback((h: boolean) => setHiddenState(h), []);
  return (
    <TabBarContext.Provider value={{ hidden, setHidden }}>
      {children}
    </TabBarContext.Provider>
  );
}

export function useTabBar(): TabBarContextValue {
  const ctx = useContext(TabBarContext);
  if (!ctx) {
    throw new Error("useTabBar must be used within a TabBarProvider");
  }
  return ctx;
}
