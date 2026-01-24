
  import React, { createContext, useContext, useState, ReactNode } from 'react';
  import { Framework } from '../types';

  export type DeployStage = 'IDLE' | 'UPLOADING' | 'EXTRACTING' | 'CONFIGURING' | 'FINALIZING';
  export type DbMode = 'NONE' | 'NEW' | 'ATTACH';

  interface DeploymentState {
      name: string;
      framework: Framework;
      subdomain: string;
      selectedDomain: string;
      file: File | null;
      dbMode: DbMode;
      selectedOrphanId: string;
      
      // Status
      deployStage: DeployStage;
      uploadProgress: number;
      extractProgress: number;
      error: string;
      isDragging: boolean;
  }

  interface DeploymentContextType extends DeploymentState {
      // Setters
      setName: (val: string) => void;
      setFramework: (val: Framework) => void;
      setSubdomain: (val: string) => void;
      setSelectedDomain: (val: string) => void;
      setFile: (val: File | null) => void;
      setDbMode: (val: DbMode) => void;
      setSelectedOrphanId: (val: string) => void;
      
      setDeployStage: (val: DeployStage) => void;
      setUploadProgress: (val: number) => void;
      setExtractProgress: (val: number) => void;
      setError: (val: string) => void;
      setIsDragging: (val: boolean) => void;
      
      resetDeployment: () => void;
  }

  const DeploymentContext = createContext<DeploymentContextType | undefined>(undefined);

  export const DeploymentProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
      // Form State
      const [name, setName] = useState('');
      const [framework, setFramework] = useState<Framework>(Framework.REACT);
      const [subdomain, setSubdomain] = useState('');
      const [selectedDomain, setSelectedDomain] = useState('kolabpanel.com'); // Default fallback
      const [file, setFile] = useState<File | null>(null);
      const [dbMode, setDbMode] = useState<DbMode>('NONE');
      const [selectedOrphanId, setSelectedOrphanId] = useState('');

      // Status State
      const [deployStage, setDeployStage] = useState<DeployStage>('IDLE');
      const [uploadProgress, setUploadProgress] = useState(0);
      const [extractProgress, setExtractProgress] = useState(0);
      const [error, setError] = useState('');
      const [isDragging, setIsDragging] = useState(false);

      const resetDeployment = () => {
          setName('');
          setSubdomain('');
          setFile(null);
          setDbMode('NONE');
          setSelectedOrphanId('');
          setDeployStage('IDLE');
          setUploadProgress(0);
          setExtractProgress(0);
          setError('');
      };

      const value: DeploymentContextType = {
          name, setName,
          framework, setFramework,
          subdomain, setSubdomain,
          selectedDomain, setSelectedDomain,
          file, setFile,
          dbMode, setDbMode,
          selectedOrphanId, setSelectedOrphanId,
          deployStage, setDeployStage,
          uploadProgress, setUploadProgress,
          extractProgress, setExtractProgress,
          error, setError,
          isDragging, setIsDragging,
          resetDeployment
      };

      return (
          <DeploymentContext.Provider value={value}>
              {children}
          </DeploymentContext.Provider>
      );
  };

  export const useDeployment = () => {
      const context = useContext(DeploymentContext);
      if (context === undefined) {
          throw new Error('useDeployment must be used within a DeploymentProvider');
      }
      return context;
  };
