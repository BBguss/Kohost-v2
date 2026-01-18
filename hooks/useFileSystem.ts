import { useState, useEffect } from 'react';
import { Site, FileNode } from '../types';
import { api } from '../services/api';

export const useFileSystem = (sites: Site[]) => {
  // Now we don't hold the whole FS state, we fetch on demand based on current site/path
  const [currentFiles, setCurrentFiles] = useState<FileNode[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchFiles = async (siteId: string, path: string) => {
      setLoading(true);
      try {
          const files = await api.files.list(siteId, path);
          setCurrentFiles(files);
      } catch (error) {
          console.error("Error fetching files", error);
          setCurrentFiles([]);
      } finally {
          setLoading(false);
      }
  };

  const uploadFile = async (siteId: string, path: string, file: File) => {
      await api.files.upload(siteId, path, file);
      fetchFiles(siteId, path);
  };

  const renameFile = async (siteId: string, path: string, oldName: string, newName: string) => {
      await api.files.rename(siteId, path, oldName, newName);
      fetchFiles(siteId, path);
  };

  const deleteFile = async (siteId: string, path: string, name: string) => {
      await api.files.delete(siteId, path, name);
      fetchFiles(siteId, path);
  };

  const createFolder = async (siteId: string, path: string, folderName: string) => {
      await api.files.createFolder(siteId, path, folderName);
      fetchFiles(siteId, path);
  };

  const getFileContent = async (siteId: string, path: string, name: string) => {
      return await api.files.getContent(siteId, path, name);
  };

  const saveFileContent = async (siteId: string, path: string, name: string, content: string) => {
      return await api.files.saveContent(siteId, path, name, content);
  };

  return {
    currentFiles,
    loadingFiles: loading,
    fetchFiles,
    uploadFile,
    renameFile,
    deleteFile,
    createFolder,
    getFileContent,
    saveFileContent
  };
};