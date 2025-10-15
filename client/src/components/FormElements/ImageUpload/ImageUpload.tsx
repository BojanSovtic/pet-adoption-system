// ImageUpload.tsx

import  { useState, useRef, useEffect, ChangeEvent, FC } from "react";

import Button from "@/components/FormElements/Button/Button"; 

import classes from "./ImageUpload.module.css";

interface ImageUploadProps {
  id: string;
  center?: boolean;
  errorText?: string;
  onInput: (id: string, file: File | undefined, isValid: boolean) => void;
}

const ImageUpload: FC<ImageUploadProps> = (props) => {

  const [file, setFile] = useState<File | undefined>(undefined);
  const [previewUrl, setPreviewUrl] = useState<string | undefined>(undefined);
  const [isValid, setIsValid] = useState<boolean>(false);
  
  const filePickerRef = useRef<HTMLInputElement>(null); 

  const pickImageHandler = () => {
    filePickerRef.current?.click();
  };

  const pickedHandler = (event: ChangeEvent<HTMLInputElement>) => {
    let pickedFile: File | undefined;
    let fileIsValid = false;

    if (event.target.files && event.target.files.length === 1) {
      pickedFile = event.target.files[0];
      setFile(pickedFile);
      setIsValid(true);
      fileIsValid = true;
    } else {
      setFile(undefined);
      setIsValid(false);
      fileIsValid = false;
    }

    props.onInput(props.id, pickedFile, fileIsValid);
  };

  useEffect(() => {
    if (!file) {
      setPreviewUrl(undefined);
      return;
    }

    const fileReader = new FileReader();

    fileReader.onload = () => {
      setPreviewUrl(fileReader.result as string);
    };

    fileReader.readAsDataURL(file);
  }, [file]);

  return (
    <div className={classes["form-control"]}>
      <input
        id={props.id}
        ref={filePickerRef}
        style={{ display: "none" }}
        type="file"
        accept=".jpg,.png,.jpeg"
        onChange={pickedHandler}
      />
      
      <div className={`${classes["image-upload"]} ${props.center && "center"}`}>
        <div className={classes["image-upload__preview"]}>
          {previewUrl ? (
            <img src={previewUrl} alt="Preview" />
          ) : (
            <p>Please pick an image.</p>
          )}
        </div>
      </div>
      
      <Button type="button" onClick={pickImageHandler}>
        Pick Image
      </Button>
      
      {!isValid && props.errorText && <p>{props.errorText}</p>}
    </div>
  );
};

export default ImageUpload;