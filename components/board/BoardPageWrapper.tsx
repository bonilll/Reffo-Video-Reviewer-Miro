import React from "react";
import BoardIdPage from "@/app/board/[boardId]/page";

export const BoardPageWrapper = ({ boardId }: { boardId: string }) => {
  return <BoardIdPage params={{ boardId }} />;
};
