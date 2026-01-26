import { create } from "zustand";

const defaultValues = { id: "", title: "", type: "board" as "board" | "project" };

type IRenameModal = {
  isOpen: boolean;
  initialValues: typeof defaultValues;
  onOpen: (id: string, title: string, type?: "board" | "project") => void;
  onClose: () => void;
};

export const useRenameModal = create<IRenameModal>((set) => ({
  isOpen: false,
  onOpen: (id, title, type = "board") =>
    set({
      isOpen: true,
      initialValues: { id, title, type },
    }),
  onClose: () =>
    set({
      isOpen: false,
      initialValues: defaultValues,
    }),
  initialValues: defaultValues,
}));
