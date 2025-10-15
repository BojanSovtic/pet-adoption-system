import { FC, CSSProperties } from "react";

import classes from "./Avatar.module.css";

interface AvatarProps {
  image: string;
  alt: string;
  width?: string | number; 
  className?: string; 
  style?: CSSProperties; 
}

const Avatar: FC<AvatarProps> = (props) => {
  return (
    <div 
      className={`${classes.avatar} ${props.className || ''}`} 
      style={props.style}
    >
      <img
        src={props.image}
        alt={props.alt}
        style={{ width: props.width, height: props.width }}
      />
    </div>
  );
}

export default Avatar;