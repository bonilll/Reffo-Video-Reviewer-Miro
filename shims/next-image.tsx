import React from "react";

type ImageProps = Omit<React.ImgHTMLAttributes<HTMLImageElement>, "src"> & {
  src: string;
  fill?: boolean;
  priority?: boolean;
};

const Image = ({ fill, style, priority: _priority, ...props }: ImageProps) => {
  if (fill) {
    return (
      <img
        {...props}
        style={{
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
          objectFit: (props as any).objectFit ?? "cover",
          ...(style || {}),
        }}
      />
    );
  }
  return <img {...props} style={style} />;
};

export default Image;
