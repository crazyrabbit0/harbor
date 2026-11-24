import { createContext, useContext, type ReactNode } from "react";

type RowCardExpansionValue = {
  enabled: boolean;
  expanded: boolean;
  expand: (width: number) => void;
  collapse: () => void;
};

const RowCardExpansionContext = createContext<RowCardExpansionValue | null>(null);

export function RowCardExpansionProvider({
  index,
  enabled,
  expanded,
  onExpand,
  onCollapse,
  children,
}: {
  index: number;
  enabled: boolean;
  expanded: boolean;
  onExpand: (index: number, width: number) => void;
  onCollapse: (index: number) => void;
  children: ReactNode;
}) {
  const expand = (width: number) => onExpand(index, width);
  const collapse = () => onCollapse(index);
  const value: RowCardExpansionValue = { enabled, expanded, expand, collapse };

  return (
    <RowCardExpansionContext.Provider value={value}>{children}</RowCardExpansionContext.Provider>
  );
}

export function useRowCardExpansion(): RowCardExpansionValue | null {
  return useContext(RowCardExpansionContext);
}
