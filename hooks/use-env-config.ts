import { useState, useEffect } from 'react';
import { getEnvConfig, isLocalhost } from '../lib/env-config';

/**
 * Hook to access environment configuration in components
 */
export const useEnvConfig = () => {
  const [env, setEnv] = useState(getEnvConfig());
  const [isLocal, setIsLocal] = useState(false);

  useEffect(() => {
    // Update isLocal state on client side
    setIsLocal(isLocalhost());
  }, []);

  return {
    ...env,
    isLocal
  };
};

export default useEnvConfig; 