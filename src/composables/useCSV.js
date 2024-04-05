// useCsvParser.js
import { ref } from 'vue';
import Papa from 'papaparse';

export default function useCsvParser() {
  const data = ref([]);

  const onFileChange = (e) => {
    const file = e.target.files[0];

    Papa.parse(file, {
      header: true,
      complete: (results) => {
        data.value = results.data;
      },
    });
  };

  return {
    data,
    onFileChange,
  };
}