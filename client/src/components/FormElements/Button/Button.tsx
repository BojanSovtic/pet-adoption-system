import React, { ReactNode, MouseEvent } from "react";
import { Link } from "react-router-dom";

import classes from "./Button.module.css";

interface BaseButtonProps {
  children: ReactNode;
  size?: 'small' | 'default' | 'large';
  inverse?: boolean;
  danger?: boolean;
}

interface ButtonElementProps extends BaseButtonProps {
  href?: undefined;
  to?: undefined;
  type?: 'button' | 'submit' | 'reset';
  onClick?: (event: MouseEvent<HTMLButtonElement>) => void;
  disabled?: boolean;
}

interface LinkElementProps extends BaseButtonProps {
  to: string; // 'to' is required for a Link
  href?: undefined;
  exact?: boolean;
  type?: undefined;
  onClick?: undefined;
  disabled?: undefined;
}

interface AnchorElementProps extends BaseButtonProps {
  href: string; // 'href' is required for an Anchor
  to?: undefined;
  type?: undefined;
  onClick?: (event: MouseEvent<HTMLAnchorElement>) => void;
  disabled?: undefined;
}

type ButtonProps = ButtonElementProps | LinkElementProps | AnchorElementProps;

const Button: React.FC<ButtonProps> = (props) => {
  const buttonClasses = `${classes.button} ${
    classes[`button--${props.size || "default"}`]
  } ${props.inverse && classes["button--inverse"]} ${
    props.danger && classes["button--danger"]
  }`;

  if (props.href) {
    return (
      <a
        className={buttonClasses}
        href={props.href}
        onClick={props.onClick as (event: MouseEvent<HTMLAnchorElement>) => void}
      >
        {props.children}
      </a>
    );
  }

  if (props.to) {
    return (
      <Link
        to={props.to}
        // @ts-ignore: exact prop is sometimes not required/typed depending on react-router-dom version
        exact={props.exact} 
        className={buttonClasses}
      >
        {props.children}
      </Link>
    );
  }

  return (
    <button
      className={buttonClasses}
      type={props.type || 'button'} // Default type to 'button' for safety
      onClick={props.onClick as (event: MouseEvent<HTMLButtonElement>) => void}
      disabled={props.disabled}
    >
      {props.children}
    </button>
  );
};

export default Button;