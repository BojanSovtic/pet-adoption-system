import { FC, ReactNode, CSSProperties } from "react";

import classes from "./Card.module.css";

interface CardProps {
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
}

const Card: FC<CardProps> = (props) => {
  return (
    <div 
      className={`${classes.card} ${props.className || ''}`} 
      style={props.style}
    >
      {props.children}
    </div>
  );
}

export default Card;