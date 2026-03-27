"use client";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { FileUploadForm } from "./FileUploadForm";
import { DatabaseConnectForm } from "./DatabaseConnectForm";
import { ApiConfigForm } from "./ApiConfigForm";

interface AddSourceDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

export function AddSourceDialog({ open, onOpenChange, onSuccess }: AddSourceDialogProps) {
  const handleSuccess = () => {
    onSuccess();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl p-0 flex flex-col max-h-[85vh]">
        <DialogHeader className="flex-shrink-0 px-6 pt-6 pb-0">
          <DialogTitle>添加数据源</DialogTitle>
          <DialogDescription>选择数据源类型并配置连接</DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="file" className="flex flex-col flex-1 min-h-0 mt-2">
          <TabsList className="w-full flex-shrink-0 mx-6" style={{ width: "calc(100% - 3rem)" }}>
            <TabsTrigger value="file" className="flex-1">文件上传</TabsTrigger>
            <TabsTrigger value="database" className="flex-1">数据库连接</TabsTrigger>
            <TabsTrigger value="api" className="flex-1">API 配置</TabsTrigger>
          </TabsList>

          <div className="flex-1 overflow-y-auto px-6 pb-6 min-h-0">
            <TabsContent value="file">
              <FileUploadForm onSuccess={handleSuccess} />
            </TabsContent>
            <TabsContent value="database">
              <DatabaseConnectForm onSuccess={handleSuccess} />
            </TabsContent>
            <TabsContent value="api">
              <ApiConfigForm onSuccess={handleSuccess} />
            </TabsContent>
          </div>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
