
"use client";

import React, { useRef, useState } from "react";
import { Upload, Loader2, FileUp } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

interface FileUploaderProps {
  onFileProcess: (file: File) => void;
  isLoading: boolean;
}

export function FileUploader({ onFileProcess, isLoading }: FileUploaderProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragActive, setDragActive] = useState(false);

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    event.preventDefault();
    const file = event.target.files?.[0];
    if (file) {
      onFileProcess(file);
    }
    // Reset file input to allow re-uploading the same file
    if(fileInputRef.current) {
        fileInputRef.current.value = "";
    }
  };
  
  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      onFileProcess(e.dataTransfer.files[0]);
    }
  };


  const handleButtonClick = () => {
    fileInputRef.current?.click();
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="font-headline">Nhập lịch sản xuất</CardTitle>
        <CardDescription>Tải lên lịch sản xuất thép (.xlsx, .xls, .csv)</CardDescription>
      </CardHeader>
      <CardContent>
        <form id="form-file-upload" onDragEnter={handleDrag} onSubmit={(e) => e.preventDefault()} className="h-full w-full">
            <input
            type="file"
            ref={fileInputRef}
            id="input-file-upload"
            className="hidden"
            onChange={handleFileChange}
            accept=".xlsx, .xls, .csv"
            disabled={isLoading}
            />
            <label 
                htmlFor="input-file-upload"
                className={`flex flex-col items-center justify-center w-full h-32 border-2 border-dashed rounded-lg cursor-pointer bg-card hover:bg-accent/20 transition-colors ${dragActive ? "border-primary bg-primary/20" : "border-border"}`}
            >
                <div className="flex flex-col items-center justify-center pt-5 pb-6">
                    <FileUp className="w-8 h-8 mb-4 text-muted-foreground" />
                    <p className="mb-2 text-sm text-muted-foreground">
                        <span className="font-semibold">Nhấn để tải lên</span> hoặc kéo và thả
                    </p>
                    <p className="text-xs text-muted-foreground">XLSX, XLS, CSV (tối đa 5MB)</p>
                </div>
                 {dragActive && <div className="absolute w-full h-full" onDragEnter={handleDrag} onDragLeave={handleDrag} onDragOver={handleDrag} onDrop={handleDrop}></div> }
            </label>
        </form>
         <Button onClick={handleButtonClick} disabled={isLoading} className="w-full mt-4">
          {isLoading ? (
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
          ) : (
            <Upload className="w-4 h-4 mr-2" />
          )}
          {isLoading ? "Đang xử lý..." : "Hoặc chọn tệp"}
        </Button>
      </CardContent>
    </Card>
  );
}
