import styles from "./FacetRail.module.css";

export interface FacetValue {
  value: string;
  count: number;
  active: boolean;
}

export interface FacetGroup {
  key: "kind" | "source" | "entity" | "issuedBy";
  label: string;
  values: FacetValue[];
}

export interface FacetRailProps {
  groups: FacetGroup[];
  onToggleFacet: (key: FacetGroup["key"], value: string) => void;
}

/**
 * FacetRail — the left sidebar for the All Events tab.
 * Four groups: Kind, Source, Entity, Issued by.
 * Clicking a value appends a filter chip (delegated to onToggleFacet).
 */
export function FacetRail({ groups, onToggleFacet }: FacetRailProps) {
  return (
    <aside
      className={styles.rail}
      aria-label="Event facets"
      data-testid="facet-rail"
    >
      {groups.map((group) => (
        <div key={group.key} className={styles.group}>
          <h3 className={styles.groupLabel}>{group.label}</h3>
          <ul className={styles.valueList} role="list">
            {group.values.map(({ value, count, active }) => (
              <li key={value}>
                <button
                  className={styles.valueBtn}
                  data-active={active ? "true" : undefined}
                  onClick={() => onToggleFacet(group.key, value)}
                  aria-pressed={active}
                  title={`Filter by ${group.label}: ${value}`}
                >
                  <span className={styles.valueName}>{value}</span>
                  <span className={styles.valueCount}>{count}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </aside>
  );
}
