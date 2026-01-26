import { Loader } from "@/components/ui/loader";

export const Loading = () => {
  return (
    <div className="h-full w-full flex flex-col justify-center items-center">
      <div className="max-w-md text-center mb-4">
        <h2 className="text-xl font-bold text-gray-800 mb-2">Loading</h2>
        <p className="text-gray-500">Preparing your workspace...</p>
      </div>
      <Loader size="lg" />
    </div>
  );
};
