import logging
import multiprocessing
from typing import List

import pandas as pd
import rpy2.rinterface_lib.callbacks
import rpy2.robjects as robjects
from rpy2.robjects import pandas2ri
from rpy2.robjects.vectors import ListVector

logger = logging.getLogger(__name__)

pandas2ri.activate()


def run_lcms_preprocessing_wrapper(
    queue,
    file_directory,
    reference_file,
    output_folder,
    chunks,
    multicore,
    cent_params,
    pdp_params,
    pgp_params,
    ms1_params,
    is_library,
    ms1_library,
    ms1_library_params,
    is_ms2,
    ms2_directory,
    ms2_params,
):
    def custom_consolewrite_print(message):
        logger.info(f"Received R message: {message}")

        filter_out_phrases = [
            "snapshotDate():",
            "loading from cache",
            "require(“CompoundDb”)",
            "[1]",
            "grouped output by",
        ]
        cleaned_message = message.strip().strip('"')
        if not any(phrase in cleaned_message for phrase in filter_out_phrases):
            if cleaned_message:
                queue.put(cleaned_message)

    original_consolewrite_print = rpy2.rinterface_lib.callbacks.consolewrite_print
    original_consolewrite_warnerror = (
        rpy2.rinterface_lib.callbacks.consolewrite_warnerror
    )
    queue.put("1/7 Initializing Libraries")

    robjects.r("library(Spectra)")
    robjects.r("library(MetaboAnnotation)")
    robjects.r("library(MetaboCoreUtils)")
    robjects.r("library(AnnotationHub)")
    robjects.r("library(MsExperiment)")
    robjects.r("library(xcms)")
    robjects.r("library(CompoundDb)")

    robjects.r("library(magrittr)")
    robjects.r("library(dplyr)")
    robjects.r("library(stringr)")
    robjects.r("library(tidyr)")
    robjects.r("library(SummarizedExperiment)")

    rpy2.rinterface_lib.callbacks.consolewrite_print = custom_consolewrite_print
    rpy2.rinterface_lib.callbacks.consolewrite_warnerror = custom_consolewrite_print

    robjects.r(
        """
                preprocess <- function(file_directory, reference_file, output_folder, chunks, multicore, cent_params, pdp_params, pgp_params, ms1_params, is_library, ms1_library, ms1_library_params, is_ms2, ms2_directory, ms2_params) {
                fls = dir(path=file_directory, full.names = TRUE)
                print('1/7 Reading Raw Files')
                pd <- read.csv(reference_file)
                
                if (multicore) {
                register(MulticoreParam(chunks))
                print('1/7 Initializing MulticoreParam')
                } else {
                register(SerialParam())
                print('1/7 Initializing SerialParam')
                }

                ## Load raw data
                data <- readMsExperiment(fls, sampleData = pd)

                print('2/7 Starting Peak Picking')
                cwp <- CentWaveParam(ppm = cent_params$ppm, peakwidth = c(cent_params$min_peakwidth, cent_params$max_peakwidth),
                                    snthresh = cent_params$snthresh, noise = cent_params$noise, integrate = cent_params$integrate,
                                    prefilter = c(cent_params$prefilter_count, cent_params$prefilter_intensity))

                data <- findChromPeaks(data, param = cwp, chunkSize = chunks)
                print('3/7 Starting Retention Time Alignment')
                pdp <- PeakDensityParam(sampleGroups = sampleData(data)$group, bw = pdp_params$bw, minFraction = pdp_params$minFraction,    binSize = pdp_params$binSize)
                data <- groupChromPeaks(data, pdp)

                pgp <- PeakGroupsParam(minFraction = pgp_params$minFraction, span = pgp_params$span)
                data <- adjustRtime(data, param = pgp, chunkSize = chunks)

                print('4/7 Starting Peak Grouping')
                data <- groupChromPeaks(data, param = pdp)

                print('5/7 Starting Peak Filling')
                data <- fillChromPeaks(data, param = ChromPeakAreaParam(), chunkSize = chunks)

                res_feature <- featureValues(data, method = "medret", value = "into")
                print('6/7 Save Peak Picking Results')
                write.csv(res_feature, paste0(output_folder, "/feature_intensities.csv"), row.names = FALSE)

                print('6/7 Load Annotation Libraries')
                ## Annotation
                ah <- AnnotationHub()
                mb <- ah[["AH111334"]]

                
                se <- quantify(data, method = "medret", filled = TRUE)
                res <- rowData(se)
                res$feature_id <- rownames(res)
                

                chosen_adducts <- sapply(ms1_params$chosen, function(x) x[[1]])
                print('6/7 Starting MS1 Annotation')
                mz_mtch <- matchValues(
                    query = res, target = compounds(mb), mzColname = "mzmed",
                    param = Mass2MzParam(ppm = ms1_params$ppm, adducts = chosen_adducts))

                res$mz_formula <- unlist(lapply(mz_mtch, function(z)
                    paste(unique(z$target_formula), collapse = "; ")))
                res$mz_adduct <- unlist(lapply(mz_mtch, function(z)
                    paste(unique(z$adduct), collapse = "; ")))

                if (is_library) {
                    print('6/7 Starting Library Annotation')
                    std_ions <- read.csv(ms1_library, header = TRUE)
                    
                    pks_match <- matchMz(res, std_ions, param = MzRtParam(ppm = ms1_library_params$ppm, toleranceRt = ms1_library_params$toleranceRt), rtColname = c("rtmed", "rtime"), mzColname = c("mzmed", "exactmass"))

                    res$library_name <- unlist(lapply(pks_match, function(z)
                    paste(unique(z$target_name), collapse = "; ")))
                    res$library_formula <- unlist(lapply(pks_match, function(z)
                    paste(unique(z$target_formula), collapse = "; ")))
                    res$library_adduct <- unlist(lapply(pks_match, function(z)
                    paste(unique(z$target_adduct), collapse = "; ")))
                    res$library_id <- unlist(lapply(pks_match, function(z)
                    paste(unique(z$target_id), collapse = "; ")))
                    res$library_score <- unlist(lapply(pks_match, function(z)
                    paste(unique(z$score), collapse = "; ")))
                    res$library_ppm_error <- unlist(lapply(pks_match, function(z)
                    paste(unique(z$ppm_error), collapse = "; ")))
                }

                if (is_ms2) {
                    print('6/7 Starting MS2 Annotation')
                    ms2_fls = dir(path=ms2_directory, full.names = TRUE)
                    ms2 <- filterMsLevel(Spectra(ms2_fls), 2L)

                    ms2 <- filterIntensity(ms2, intensity = function(z)
                    z > max(z, na.rm = TRUE) * 0.01)

                    int_sum <- function(x, ...) {
                    x[, "intensity"] <- x[, "intensity"] / sum(x[, "intensity"], na.rm = TRUE)
                    x
                    }
                    ms2 <- addProcessing(ms2, int_sum)

                    #' Find MS2 spectra matching the m/z and retention times of our features
                    ms2match <- matchValues(res, ms2, param = MzRtParam(ppm = ms2_params$ppm, toleranceRt = ms2_params$toleranceRt),
                                            mzColname = c("mzmed", "precursorMz"),
                                            rtColname = c("rtmed", "rtime"))

                    res_ms2 <- target(ms2match)[targetIndex(ms2match)]
                    res_ms2$feature_id <- query(ms2match)$feature_id[queryIndex(ms2match)]


                    mbs <- Spectra(mb)
                    mbs <- filterIntensity(mbs, intensity = function(z)
                    z > max(z, na.rm = TRUE) * 0.01)
                    mbs <- addProcessing(mbs, int_sum)
                    mbs_neg <- filterPolarity(mbs, ms1_params$polarity)

                    #' Identify MassBank spectra with a similarity >= 0.7
                    register(SerialParam())
                    ms2mb2_neg <- matchSpectra(res_ms2, mbs_neg, 
                                            param = CompareSpectraParam(ppm = ms2_params$ppm, THRESHFUN = function(x) which(x >= ms2_params$scoreThreshold),
                                                requirePrecursor = ms2_params$requirePrecursor, tolerance = ms2_params$tolerance))

                    tmp <- ms2mb2_neg[whichQuery(ms2mb2_neg)]
                    tmp2 <- pruneTarget(tmp)
                    ms2_data <- spectraData(tmp2) %>% as.data.frame() %>% select(feature_id, target_name, target_formula, target_adduct, score)

                    collapsed_df <- ms2_data %>%
                    group_by(feature_id, target_formula) %>%
                    summarise(
                        target_name = paste(unique(target_name), collapse = ";"),
                        target_adduct = paste(unique(target_adduct), collapse = ";"),
                        score = max(round(score, 3))
                    ) %>%
                    ungroup() %>%
                    group_by(feature_id) %>%
                    summarise(
                        ms2_name = paste(unique(target_name), collapse = ";"),
                        ms2_formula = paste(target_formula, collapse = ";"),
                        ms2_adduct = paste(unique(target_adduct), collapse = ";"),
                        ms2_score = paste(score, collapse = ";")
                    ) %>%
                    ungroup()

                    res <- left_join(res %>% as.data.frame(), collapsed_df, by = "feature_id")
                }

                write.csv(res, paste0(output_folder, "/feature_annotation.csv"), row.names = FALSE)
                }
            """
    )

    try:
        robjects.r.preprocess(
            file_directory,
            reference_file,
            output_folder,
            chunks,
            multicore,
            ListVector(cent_params),
            ListVector(pdp_params),
            ListVector(pgp_params),
            ListVector(ms1_params),
            is_library,
            ms1_library,
            ListVector(ms1_library_params),
            is_ms2,
            ms2_directory,
            ListVector(ms2_params),
        )

    finally:
        rpy2.rinterface_lib.callbacks.consolewrite_print = original_consolewrite_print
        rpy2.rinterface_lib.callbacks.consolewrite_warnerror = (
            original_consolewrite_warnerror
        )

    queue.put("Task Completed")


def run_lcms_preprocessing(
    session_id,
    manager,
    file_directory,
    reference_file,
    output_folder,
    chunks,
    multicore,
    cent_params,
    pdp_params,
    pgp_params,
    ms1_params,
    is_library,
    ms1_library,
    ms1_library_params,
    is_ms2,
    ms2_directory,
    ms2_params,
):
    queue = multiprocessing.Queue()
    process = multiprocessing.Process(
        target=run_lcms_preprocessing_wrapper,
        args=(
            queue,
            file_directory,
            reference_file,
            output_folder,
            chunks,
            multicore,
            cent_params,
            pdp_params,
            pgp_params,
            ms1_params,
            is_library,
            ms1_library,
            ms1_library_params,
            is_ms2,
            ms2_directory,
            ms2_params,
        ),
    )

    process.start()
    while True:
        message = queue.get()
        if message == "Task Completed":
            break
        manager.send_message(session_id, message)

    process.join()

    run_annotation_ranking(output_folder, is_library, is_ms2)


def run_annotation_ranking(output_folder, is_library, is_ms2):
    library_scores = {}

    feature_annotation = pd.read_csv(f"{output_folder}/feature_annotation.csv")
    feature_annotation["name"] = feature_annotation["feature_id"]
    for i in range(len(feature_annotation)):
        if not pd.isna(feature_annotation["mz_formula"][i]):
            if len(feature_annotation["mz_formula"][i].split(";")) > 1:

                feature_annotation.loc[i, "formula"] = feature_annotation["mz_formula"][
                    i
                ].split(";")[0]

            else:
                feature_annotation.loc[i, "formula"] = feature_annotation["mz_formula"][
                    i
                ].split(";")[0]

        if (
            is_ms2
            and not pd.isna(feature_annotation["ms2_formula"][i])
            and not pd.isna(feature_annotation["ms2_score"][i])
            and feature_annotation["ms2_score"][i] != "NA"
        ):
            if len(feature_annotation["ms2_formula"][i].split(";")) > 1:
                ms2_scores = {}
                for name, score in zip(
                    feature_annotation["ms2_formula"][i].split(";"),
                    feature_annotation["ms2_score"][i].split(";"),
                ):
                    name = name.strip()
                    ms2_scores[name] = float(score.strip())
                lowest_key = max(ms2_scores, key=lambda x: abs(ms2_scores[x]))
                feature_annotation.loc[i, "formula"] = lowest_key

            else:
                name = feature_annotation["ms2_formula"][i].strip()
                feature_annotation.loc[i, "formula"] = name

        if (
            is_library
            and not pd.isna(feature_annotation["library_name"][i])
            and not pd.isna(feature_annotation["library_score"][i])
            and not pd.isna(feature_annotation["library_formula"][i])
            and feature_annotation["library_score"][i] != "NA"
        ):
            if len(feature_annotation["library_id"][i].split(";")) > 1:
                for name, id, formula in zip(
                    feature_annotation["library_name"][i].split(";"),
                    feature_annotation["library_id"][i].split(";"),
                    feature_annotation["library_formula"][i].split(";"),
                ):
                    id = f"{name.strip()}_{id.strip()}_{formula.strip()}"
                    if id not in library_scores:
                        library_scores[id] = {}
                    library_scores[id][i] = float(
                        feature_annotation["library_score"][i]
                    )
            else:
                id = f'{feature_annotation["library_name"][i].strip()}_{feature_annotation["library_id"][i]}_{feature_annotation["library_formula"][i]}'
                if id not in library_scores:
                    library_scores[id] = {}
                library_scores[id][i] = float(feature_annotation["library_score"][i])

    annotations = []

    for key, sub_dict in library_scores.items():
        lowest_key = min(sub_dict, key=lambda x: abs(sub_dict[x]))
        if lowest_key in annotations:
            loop = True
            while loop:
                sub_dict.pop(lowest_key)
                if not sub_dict:
                    break
                lowest_key = min(sub_dict, key=lambda x: abs(sub_dict[x]))
                if lowest_key not in annotations:
                    loop = False

        name, id, formula = key.split("_")
        feature_annotation.loc[lowest_key, "name"] = name
        feature_annotation.loc[lowest_key, "id"] = id
        feature_annotation.loc[lowest_key, "formula"] = formula
        annotations.append(lowest_key)

    feature_annotation.to_csv(f"{output_folder}/feature_annotation.csv", index=False)


def run_isotope_detection(
    int_file_data: pd.DataFrame,
    peak_file_data: pd.DataFrame,
    labeling_data: List[str],
    rt_window: float,
    ppm: float,
    noise_cutoff: float,
    alpha: float,
    enrich_tol: float,
    isotopes_path: str,
):
    r_int_data = pandas2ri.py2rpy(int_file_data)
    r_peak_data = pandas2ri.py2rpy(peak_file_data)

    robjects.r(
        """
printIso <- function(listReport, outputfile) {
  colNames = names(listReport)
  nblocks = length(colNames)
  colNames = c("", colNames)
  colNames = colNames[-length(colNames)]
  colNames = c(colNames, colnames(listReport$sampleData[[1]]))
  
  write.table(t(colNames), file = outputfile, col.names = FALSE, row.names = FALSE, sep = ",") 
  nrows = length(listReport[[1]])
  for (i in 1:nrows) {
    maxRows = 1
    ncols = 0
    for (j in 1:nblocks) {
      cell = listReport[[j]][[i]]
      if (length(cell) > maxRows & "numeric" %in% class(cell)) {
        maxRows = length(cell)
        ncols = ncols + 1
      }
      else if ("matrix" %in% class(cell)) {
        ncols = ncols + dim(cell)[2]
      }
      else {
        ncols = ncols + 1
      }
    }
    rowMatrix = matrix(rep(NA, (maxRows + 1) * ncols), nrow = maxRows + 
                         1)
    for (j in 1:maxRows) {
      ncol = 1
      for (k in 1:nblocks) {
        cell = listReport[[k]][[i]]
        if (length(cell) == 1 & j == 1 & all(cell != -1)) {
          rowMatrix[j, ncol] = cell
          ncol = ncol + 1
        }
        else if ("numeric" %in% class(cell) || "integer" %in% class(cell) || "character" %in% class(cell)) {
          if (!is.na(cell[j]) & cell[j] != -1) {
            rowMatrix[j, ncol] = cell[j]
          }
          ncol = ncol + 1
        }
        else if ("matrix" %in% class(cell)) {
          rowMatrix[j, ncol:(ncol + dim(cell)[2] - 1)] = cell[j, 
          ]
          ncol = ncol + dim(cell)[2]
        }
      }
    }
    nr = dim(rowMatrix)[1]
    rowMatrix = cbind(c(i, rep(NA, nr - 1)), rowMatrix)
    write.table(rowMatrix, file = outputfile, append = TRUE, sep = ",", col.names = FALSE, row.names = FALSE, na = "", quote = FALSE)
  }
}

getIso <- function(peaks, groups, classes, unlabeledSamples, labeledSamples, 
                   isotopeMassDiff, RTwindow, ppm, massOfLabeledAtom, noiseCutoff, 
                   alpha, varEq = FALSE, singleSample = FALSE, 
                   compareOnlyDistros = FALSE, monotonicityTol = FALSE, 
                   enrichTol = 0.1) {
  peakIntensities = as.matrix(peaks[order(groups$mzmed), ])
  peakIntensities[is.na(peakIntensities)] = 0
  groups = groups[order(groups$mzmed), ]
  groupRTs = groups$rtmed
  groupMzs = groups$mzmed
  groupFeatures = groups$name
  groupID = groups$id
  groupFormula = groups$formula
  groupIDs = as.numeric(rownames(groups))
  nGroups = length(groupMzs)
  
  numSamples = length(classes)
  intensities1 = peakIntensities[, which(classes == unlabeledSamples), 
                                 drop = FALSE]
  intensities2 = peakIntensities[, which(classes == labeledSamples), 
                                 drop = FALSE]
  iMD = isotopeMassDiff
  base <- list()
  labeled <- list()
  basePeak <- list()
  labeledPeak <- list()
  groupIndicesByRT = order(groupRTs)
  orderedGroupRTs = groupRTs[groupIndicesByRT]
  for (i in 1:nGroups) {
    binI = groupIndicesByRT[orderedGroupRTs - orderedGroupRTs[i] >= 
                              0 & orderedGroupRTs - orderedGroupRTs[i] <= RTwindow]
    bin = groups[binI, ]
    binSize = length(binI)
    I = groupIndicesByRT[i]
    if (binSize > 0) {
      for (j in 1:binSize) {
        if (groups$mzmed[I] < bin$mzmed[j]) {
          a = I
          b = binI[j]
        }
        else {
          a = binI[j]
          b = I
        }
        delta = (groupMzs[b] - groupMzs[a])/iMD
        DELTA = round(delta)
        if (DELTA == 0) {
          next
        }
        if (delta <= DELTA * (1 + ppm/1e+06) + (groupMzs[a] * 
                                                ppm/1e+06)/(iMD * (1 - ppm/1e+06)) & delta >= 
            DELTA * (1 - ppm/1e+06) - (groupMzs[a] * ppm/1e+06)/(iMD * 
                                                                 (1 + ppm/1e+06))) {
          
          
          if (DELTA * massOfLabeledAtom >= groupMzs[a]) {
            next
          }


          if (mean(intensities1[b, ]) > mean(intensities1[a, 
          ]) & !compareOnlyDistros) {
            next
          }
          if (all(intensities1[a, ] == 0) & all(intensities2[a, 
          ] == 0)) {
            next
          }
          if (all(intensities1[b, ] == 0) & all(intensities2[b, 
          ] == 0)) {
            next
          }
          base = c(base, a)
          labeled = c(labeled, b)
          basePeak = c(basePeak, groupMzs[a])
          labeledPeak = c(labeledPeak, groupMzs[b])
        }
      }
    }
  }
  labelsMatrix = as.matrix(cbind(unlist(base), unlist(labeled), 
                                 unlist(basePeak), unlist(labeledPeak)))
  labelsMatrix = labelsMatrix[order(labelsMatrix[, 3], labelsMatrix[, 
                                                                    4]), ]
  numPutativeLabels = dim(labelsMatrix)[1]
  basePeaks = unique(labelsMatrix[, 1])
  numLabeledPeaks = length(basePeaks)
  outtakes = list()
  
  
  
  for (i in 1:numPutativeLabels) {
    B = labelsMatrix[, 2] == labelsMatrix[i, 1]
    A = labelsMatrix[B, 1]
    C = which(labelsMatrix[, 1] %in% A)
    if (any(labelsMatrix[C, 2] == labelsMatrix[i, 2])) {
      outtakes = c(outtakes, i)
      next
    }
    if (i < numPutativeLabels) {
      A = (i + 1):numPutativeLabels
      idx = any(labelsMatrix[A, 1] == labelsMatrix[i, 
                                                   1] & labelsMatrix[A, 2] == labelsMatrix[i, 2])
      if (idx) {
        outtakes = c(outtakes, i)
      }
    }
  }
  outtakes = unlist(outtakes)
  labelsMatrix = labelsMatrix[-outtakes, ]
  numPutativeLabels = dim(labelsMatrix)[1]
  basePeaks = unique(labelsMatrix[, 1])
  numLabeledPeaks = length(basePeaks)
  base = list()
  names = list()
  ids = list()
  formulas = list()
  mz = list()
  ID = list()
  RT = list()
  absInt1 = list()
  absInt2 = list()
  relInt1 = list()
  relInt2 = list()
  totInt1 = list()
  totInt2 = list()
  CVabsInt1 = list()
  CVabsInt2 = list()
  SDrelInt1 = list()
  SDrelInt2 = list()
  foldEnrichment = list()
  pvalues = list()
  sampleIntensities = list()
  j = 1
  for (i in 1:numLabeledPeaks) {
    a = basePeaks[i]
    baseIntensities = c(intensities1[a, ], intensities2[a, 
    ])
    isotopologues = list()
    IDs = list()
    RTs = list()
    numisotopologues = 0
    k = j
    while (k <= numPutativeLabels) {
      if (labelsMatrix[k, 1] != a) {
        break  # Exit the loop if the condition is not met
      }
      isotopologues = c(isotopologues, groupMzs[labelsMatrix[k, 
                                                             2]])
      IDs = c(IDs, groupIDs[labelsMatrix[k, 2]])
      RTs = c(RTs, groupRTs[labelsMatrix[k, 2]])
      numisotopologues = numisotopologues + 1
      k = k + 1
    }
    isotopologues = unlist(isotopologues)
    IDs = unlist(IDs)
    RTs = unlist(RTs)
    if (mean(intensities1[a, ]) < noiseCutoff) {
      j = k
      next
    }
    abs1 = list()
    abs2 = list()
    labeledIntensities = matrix(rep(0, numisotopologues * 
                                      numSamples), nrow = numisotopologues, ncol = numSamples)
    if (numisotopologues == 0) {
      next
    }
    for (l in 1:numisotopologues) {
      b = labelsMatrix[j + l - 1, 2]
      labeledIntensities[l, ] = cbind(intensities1[b, , drop = FALSE], intensities2[b, , drop = FALSE])
      abs1 = c(abs1, mean(intensities1[b, ]))
      abs2 = c(abs2, mean(intensities2[b, ]))
    }
    abs1 = unlist(abs1)
    abs2 = unlist(abs2)
    if (numisotopologues != length(unique(round(isotopologues)))) {
      M0 = round(groupMzs[a])
      isos = round(isotopologues)
      reduced = unique(isos)
      numUniqIsos = length(reduced)
      outtakes = list()
      for (r in 1:numUniqIsos) {
        q = which(isos == reduced[r])
        if (length(q) > 1) {
          massdefect = iMD * (reduced[r] - M0)
          delta = abs(groupMzs[IDs[q]] - groupMzs[a] - 
                        massdefect)
          outtakes = c(outtakes, q[which(delta != min(delta))])
        }
      }
      if (length(outtakes) > 0) {
        outtakes = unlist(outtakes)
        isotopologues = isotopologues[-outtakes]
        IDs = IDs[-outtakes]
        RTs = RTs[-outtakes]
        numisotopologues = length(isotopologues)
        abs1 = abs1[-outtakes]
        abs2 = abs2[-outtakes]
        labeledIntensities = labeledIntensities[-outtakes, 
                                                , drop = FALSE]
      }
    }
    if (!compareOnlyDistros & monotonicityTol) {
      meanMprevUL = mean(intensities1[a, ])
      outtakes = list()
      for (l in 1:numisotopologues) {
        if (l == 1 & abs1[l] > (1 + monotonicityTol) * 
            meanMprevUL) {
          outtakes = c(outtakes, l)
        }
        else if (l > 1 & abs1[l] > (1 + monotonicityTol) * 
                 meanMprevUL & round(isotopologues[l] - isotopologues[l - 
                                                                      1]) > 1) {
          outtakes = c(outtakes, l)
        }
        else {
          meanMprevUL = abs1[l]
        }
      }
      outtakes = unlist(outtakes)
      if (length(outtakes) > 0) {
        abs1 = abs1[-outtakes]
        abs2 = abs2[-outtakes]
        labeledIntensities = labeledIntensities[-outtakes, 
                                                , drop = FALSE]
        isotopologues = isotopologues[-outtakes]
        IDs = IDs[-outtakes]
        RTs = RTs[-outtakes]
      }
    }
    isotopologues = c(groupMzs[a], isotopologues)
    IDs = c(groupIDs[a], IDs)
    RTs = c(groupRTs[a], RTs)
    allIntensities = rbind(baseIntensities, labeledIntensities)
    abs1 = c(mean(intensities1[a, ]), abs1)
    abs2 = c(mean(intensities2[a, ]), abs2)
    numisotopologues = length(isotopologues)
    sumIntensities = colSums(allIntensities)
    tot1 = mean(sumIntensities[1:dim(intensities1)[2]])
    tot2 = mean(sumIntensities[(dim(intensities1)[2] + 1):numSamples])
    cv1 = sd(sumIntensities[1:dim(intensities1)[2]])/tot1
    cv2 = sd(sumIntensities[(dim(intensities1)[2] + 1):numSamples])/tot2
    groupIntensities = allIntensities/matrix(rep(sumIntensities, 
                                                 numisotopologues), nrow = numisotopologues, byrow = TRUE)
    gI1 = groupIntensities[, 1:dim(intensities1)[2], drop = FALSE]
    gI2 = groupIntensities[, (dim(intensities1)[2] + 1):numSamples, 
                           drop = FALSE]
    gI1 = gI1[, colSums(is.na(gI1)) == 0, drop = FALSE]
    gI2 = gI2[, colSums(is.na(gI2)) == 0, drop = FALSE]
    if (dim(gI1)[2] < dim(intensities1)[2]/2 || dim(gI2)[2] < 
        dim(intensities2)[2]/2) {
      j = k
      next
    }
    rel1 = rowMeans(gI1)
    rel2 = rowMeans(gI2)
    sd1 = apply(gI1, 1, sd)
    sd2 = apply(gI2, 1, sd)
    enrichRatios = rel2/rel1
    if (!compareOnlyDistros) {
      if (enrichRatios[1] > (1 + enrichTol)) {
        j = k
        next
      }
    }
    if (!singleSample) {
      pvalue = list()
      for (l in 1:numisotopologues) {
        if (all(gI1[l, ] == 1) & all(gI2[l, ] == 0) || 
            is.infinite(enrichRatios[l])) {
          pvalue = c(pvalue, 0)
        }
        else {
          T = try(t.test(gI1[l, ], gI2[l, ], var.equal = varEq), 
                  silent = TRUE)
          if (class(T) == "try-error") {
            pvalue = c(pvalue, 1)
            break
          }
          else {
            pvalue = c(pvalue, T$p.value)
          }
        }
      }
      if (any(unlist(pvalue) < alpha) & !any(unlist(pvalue) == 
                                             1)) {
        names = c(names, ifelse(is.na(groupFeatures[a]), "", groupFeatures[a]))
        ids = c(ids, ifelse(is.na(groupID[a]), "", groupID[a]))
        formulas = c(formulas, ifelse(is.na(groupFormula[a]), "", groupFormula[a]))
        
        base = c(base, groupMzs[a])
        mz = c(mz, list(isotopologues))
        ID = c(ID, list(IDs))
        RT = c(RT, list(RTs))
        absInt1 = c(absInt1, list(abs1))
        absInt2 = c(absInt2, list(abs2))
        relInt1 = c(relInt1, list(rel1))
        relInt2 = c(relInt2, list(rel2))
        CVabsInt1 = c(CVabsInt1, cv1)
        CVabsInt2 = c(CVabsInt2, cv2)
        totInt1 = c(totInt1, tot1)
        totInt2 = c(totInt2, tot2)
        SDrelInt1 = c(SDrelInt1, list(sd1))
        SDrelInt2 = c(SDrelInt2, list(sd2))
        foldEnrichment = c(foldEnrichment, list(enrichRatios))
        pvalues = c(pvalues, list(unlist(pvalue)))
        sampleIntensities = c(sampleIntensities, list(allIntensities))
      }
    }
    else {
      deltaSpec = sum(abs(rel1[1:numisotopologues - 1] - 
                            rel2[1:numisotopologues - 1]))
      names = c(names, ifelse(is.na(groupFeatures[a]), "", groupFeatures[a]))
      ids = c(ids, ifelse(is.na(groupID[a]), "", groupID[a]))
      formulas = c(formulas, ifelse(is.na(groupFormula[a]), "", groupFormula[a]))
      
      base = c(base, groupMzs[a])
      mz = c(mz, list(isotopologues))
      ID = c(ID, list(IDs))
      RT = c(RT, list(RTs))
      absInt1 = c(absInt1, list(abs1))
      absInt2 = c(absInt2, list(abs2))
      relInt1 = c(relInt1, list(rel1))
      relInt2 = c(relInt2, list(rel2))
      CVabsInt1 = c(CVabsInt1, cv1)
      CVabsInt2 = c(CVabsInt2, cv2)
      totInt1 = c(totInt1, tot1)
      totInt2 = c(totInt2, tot2)
      SDrelInt1 = c(SDrelInt1, list(sd1))
      SDrelInt2 = c(SDrelInt2, list(sd2))
      foldEnrichment = c(foldEnrichment, list(enrichRatios))
      pvalues = c(pvalues, deltaSpec)
      sampleIntensities = c(sampleIntensities, list(allIntensities))
    }
    j = k
  }
  
  labelsData = list(name = names, compound_id = ids, formula = formulas, compound = base, isotopologue = mz, groupID = ID, 
                    rt = RT, meanAbsU = absInt1, totalAbsU = totInt1, cvTotalU = CVabsInt1, 
                    meanAbsL = absInt2, totalAbsL = totInt2, cvTotalL = CVabsInt2, 
                    meanRelU = relInt1, meanRelL = relInt2, p_value = pvalues, 
                    enrichmentLvsU = foldEnrichment, sdRelU = SDrelInt1, 
                    sdRelL = SDrelInt2, sampleData = sampleIntensities)
  return(labelsData)
}
"""
    )

    result = robjects.r.getIso(
        r_int_data,
        r_peak_data,
        labeling_data,
        "12C",
        "13C",
        1.00335,
        rt_window,
        ppm,
        12.0,
        noise_cutoff,
        alpha=alpha,
        enrichTol=enrich_tol,
    )

    robjects.r.printIso(result, isotopes_path)
