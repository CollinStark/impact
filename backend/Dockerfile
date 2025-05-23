FROM python:3.10
FROM bioconductor/bioconductor_docker:RELEASE_3_18

WORKDIR /app
RUN pip3 install --upgrade pip setuptools wheel
COPY ./requirements.txt /app/requirements.txt
RUN pip3 install -r /app/requirements.txt

RUN Rscript -e "options(repos = c(CRAN = 'https://cran.r-project.org')); BiocManager::install(update = FALSE); BiocManager::install(c('xcms', 'MetaboAnnotation', 'Spectra', 'MetaboCoreUtils', 'AnnotationHub', 'MsExperiment', 'magrittr', 'dplyr', 'stringr', 'tidyr', 'SummarizedExperiment'), update = FALSE)"

RUN Rscript -e "library(AnnotationHub); ah <- AnnotationHub(); mb <- ah[['AH111334']]"

COPY . /app
EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--reload"]
