import styles from './Segmented.module.css';

/** Row of toggle buttons for a single choice. */
export function Segmented({ label, options, value, onChange }) {
  return (
    <div className={styles.wrap}>
      <span className={styles.label} id={`seg-${label}`}>
        {label}
      </span>
      <div className={styles.group} role="group" aria-labelledby={`seg-${label}`}>
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            className={styles.option}
            aria-pressed={option.value === value}
            onClick={() => onChange(option.value)}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}
