"use client";

import { shallow } from "@liveblocks/client";
import { memo } from "react";

import { colorToCSS } from "@/lib/utils";
import { useOthersConnectionIds, useOthersMapped } from "@/liveblocks.config";
import { Color } from "@/types/canvas";

import { Cursor } from "./cursor";
import { Path } from "./path";

// Definisco l'interfaccia per l'oggetto other
interface OtherUser {
  pencilDraft?: number[][];
  penColor?: Color;
}

const Cursors = () => {
  const ids = useOthersConnectionIds();

  return (
    <>
      {ids.map((connectionId) => (
        <Cursor key={connectionId} connectionId={connectionId} />
      ))}
    </>
  );
};

const Drafts = () => {
  const others = useOthersMapped(
    (other) => ({
      pencilDraft: other.presence.pencilDraft,
      penColor: other.presence.penColor,
    }),
    shallow,
  );

  return (
    <>
      {others.map(([key, other]) => {
        // Cast di other al tipo definito
        const typedOther = other as OtherUser;
        
        if (typedOther && typedOther.pencilDraft) {
          return (
            <Path
              key={key}
              x={0}
              y={0}
              points={typedOther.pencilDraft}
              fill={typedOther.penColor ? colorToCSS(typedOther.penColor) : "#000"}
            />
          );
        }

        return null;
      })}
    </>
  );
};

export const CursorsPresence = memo(() => {
  return (
    <>
      <Drafts />
      <Cursors />
    </>
  );
});

CursorsPresence.displayName = "CursorsPresence";
