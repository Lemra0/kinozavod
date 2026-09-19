import { Link } from 'react-router-dom';
import styles from './Button.module.css';

/**
 * Button in the style guide variants.
 * Renders a router link when `to` is given, otherwise a <button>.
 */
export function Button({ variant = 'secondary', to, className = '', type = 'button', ...rest }) {
  const classes = `${styles.button} ${styles[variant]} ${className}`.trim();

  if (to) {
    return <Link to={to} className={classes} {...rest} />;
  }

  return <button type={type} className={classes} {...rest} />;
}
