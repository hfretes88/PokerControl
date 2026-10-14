import { Platform, Share } from 'react-native';
import { saveDocuments } from '@react-native-documents/picker';
import RNFS from 'react-native-fs';

interface SaveFileInput {
  filename: string;
  contents: string;
  encoding: 'utf8' | 'base64';
  mimeType: string;
  /** Título del diálogo de compartir en iOS. */
  title: string;
}

/**
 * Escribe el archivo en el directorio de la app y deja que el usuario elija
 * dónde guardarlo. Puede lanzar OPERATION_CANCELED / 'User did not share'
 * si el usuario cancela: lo maneja quien llama.
 */
export async function saveFile({ filename, contents, encoding, mimeType, title }: SaveFileInput): Promise<void> {
  const path = `${RNFS.DocumentDirectoryPath}/${filename}`;
  await RNFS.writeFile(path, contents, encoding);

  if (Platform.OS === 'android') {
    // Share.share con url: file:// no funciona en Android sin un FileProvider:
    // termina compartiendo el contenido como texto plano en vez del archivo.
    // saveDocuments abre el diálogo nativo "Guardar como" y sí guarda un
    // archivo real (en Descargas, Drive, etc.).
    await saveDocuments({
      sourceUris: [encodeURI(`file://${path}`)],
      fileName:   filename,
      mimeType,
    });
  } else {
    // iOS comparte directo como archivo
    await Share.share({ title, url: path });
  }
}
