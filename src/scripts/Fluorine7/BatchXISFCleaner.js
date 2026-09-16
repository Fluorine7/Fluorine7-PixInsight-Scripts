/*
 * Batch XISF Cleaner
 * Copyright (c) 2026 Fluorine Zhu
 * SPDX-License-Identifier: MIT
 */
#engine v8
#feature-id Fluorine7BatchXISFCleaner : Batch Processing > Batch XISF Cleaner
#feature-info Retain one image from each XISF container and discard companion images.<br/>Optional deletion of originals after verified output.

CoreApplication.ensureMinimumVersion( 1, 9, 4 );

function cleanDirectory( path )
{
   return (File.extractDrive( path ) + File.extractDirectory( path )).replace( /\/$/, "" );
}

function cleanUniquePath( directory, stem )
{
   let path = directory + '/' + stem + '.xisf';
   for ( let i = 1; (File.exists( path ) || File.directoryExists( path )); ++i )
      path = directory + '/' + stem + '_' + i + '.xisf';
   return path;
}

function cleanClose( windows, reportOnly = false )
{
   let errors = [];
   for ( let w of windows )
      try
      {
         if ( !w.isNull ) w.forceClose();
      }
      catch ( e ) { errors.push( cleanErrorText( e ) ); }
   if ( errors.length )
   {
      let message = 'Unable to close script image windows: ' + errors.join( '; ' );
      if ( reportOnly ) console.writeln( '** Cleanup warning: ' + message );
      else throw new Error( message );
   }
}

// Compare every sample, in bounded row buffers, before permitting deletion.
function cleanVerifyPixels( a, b )
{
   for ( let key of [ 'width', 'height', 'numberOfChannels', 'bitsPerSample', 'isReal', 'isColor' ] )
      if ( a[key] != b[key] )
         throw new Error( 'Output image differs: ' + key );
   let x = new Float64Array( a.width );
   let y = new Float64Array( a.width );
   for ( let c = 0; c < a.numberOfChannels; ++c )
      for ( let row = 0; row < a.height; ++row )
      {
         a.getSamples( x, 0, row, a.width, row + 1, c );
         b.getSamples( y, 0, row, b.width, row + 1, c );
         for ( let i = 0; i < x.length; ++i )
            if ( x[i] !== y[i] && !(isNaN( x[i] ) && isNaN( y[i] )) )
               throw new Error( 'Output pixel verification failed.' );
      }
}

// Recognize companion identifiers, including filename prefixes and PI collision suffixes.
// Unknown images remain candidates: ambiguity must never trigger automatic deletion.
function cleanIsCompanion( id )
{
   return /(?:^|_)(?:(?:rejection|clip|clipping)[_]*(?:high|low)(?:_map)?|(?:high|low)[_]*(?:rejection|clip)(?:_map)?|drizzle[_]*(?:weights?|map)|weight[_]*(?:image|map)|crop[_]*mask|slope(?:_map)?)(?:_\d+)*$/i.test( id || '' );
}

function cleanErrorText( error )
{
   if ( error === null || error === undefined ) return 'Unknown error (no diagnostic supplied).';
   return error.message ? String( error.message ) : String( error );
}

function cleanImageTypeLabel( window )
{
   let names = [ ['Bias', 'Bias frame'], ['Dark', 'Dark frame'], ['Flat', 'Flat frame'], ['Light', 'Light frame'],
      ['MasterBias', 'Master bias'], ['MasterDark', 'Master dark'], ['MasterFlat', 'Master flat'],
      ['MasterLight', 'Master light'], ['DefectMap', 'Defect map'],
      ['RejectionMapHigh', 'High rejection map'], ['RejectionMapLow', 'Low rejection map'],
      ['BinaryRejectionMapHigh', 'Binary high rejection map'], ['BinaryRejectionMapLow', 'Binary low rejection map'],
      ['SlopeMap', 'Slope map'], ['WeightMap', 'Weight map'] ];
   for ( let entry of names )
      if ( ImageType[entry[0]] !== undefined && window.imageType === ImageType[entry[0]] )
         return entry[1];
   let id = window.mainView.id || '';
   if ( window.imageType === undefined || window.imageType === ImageType.Unknown )
   {
      if ( /(?:^|_)crop_?mask(?:_\d+)*$/i.test( id ) ) return 'Crop mask (by name)';
      if ( cleanIsCompanion( id ) ) return 'Companion image (by name)';
      return 'Unspecified type';
   }
   return 'Unknown type (' + window.imageType + ')';
}

function cleanCompanionWindow( window )
{
   let type = window.imageType;
   let maps = [ ImageType.DefectMap, ImageType.RejectionMapHigh, ImageType.RejectionMapLow,
      ImageType.BinaryRejectionMapHigh, ImageType.BinaryRejectionMapLow, ImageType.SlopeMap, ImageType.WeightMap ];
   if ( maps.some( t => t !== undefined && t === type ) ) return true;
   // Known science/calibration types take precedence over suggestive names.
   let science = [ ImageType.Light, ImageType.MasterLight, ImageType.Bias, ImageType.MasterBias,
      ImageType.Dark, ImageType.MasterDark, ImageType.Flat, ImageType.MasterFlat ];
   if ( science.some( t => t !== undefined && t === type ) ) return false;
   if ( type !== undefined && type !== ImageType.Unknown )
      throw new Error( 'Unrecognized image type; inspect contents and select manually.' );
   return cleanIsCompanion( window.mainView.id );
}

function cleanSelectImage( windows, index )
{
   if ( index !== null )
   {
      if ( !Number.isInteger( index ) || index < 0 || index >= windows.length )
         throw new Error( 'Retained image number is outside this file.' );
      return index;
   }
   let candidates = [];
   for ( let i = 0; i < windows.length; ++i )
      if ( !cleanCompanionWindow( windows[i] ) )
         candidates.push( i );
   if ( candidates.length != 1 )
      throw new Error( 'Cannot identify a unique main image (' + candidates.length +
         ' candidates). Original retained. Inspect contents and use manual selection.' );
   return candidates[0];
}

function cleanValidateSuffix( suffix )
{
   if ( /[\\/:*?"<>|\x00-\x1f]/.test( suffix ) || /[. ]$/.test( suffix ) )
      throw new Error( 'The filename suffix must not contain path separators, reserved characters, or trailing dots/spaces.' );
}

function cleanXISF( source, directory, index, deleteOriginal, suffix = '_clean' )
{
   cleanValidateSuffix( suffix );
   // Do not delete a path whose contents changed while the output was written.
   let originalInfo = new FileInfo( source );
   let originalSize = originalInfo.size;
   let originalModified = originalInfo.lastModified.getTime();
   if ( deleteOriginal && originalInfo.isSymbolicLink )
      throw new Error( 'Deletion mode does not accept symbolic links. Original retained.' );
   let windows = [], check = [], stage = '', target = '';
   try
   {
      // copy=true guarantees private windows, independent of images open by the user.
      windows = ImageWindow.open( source, '', '', true );
      if ( windows.length == 1 && (index === null || index === 0) )
         return 'Skipped: already contains one image (original retained)';
      index = cleanSelectImage( windows, index );
      let main = windows[index];
      if ( main.mainView.image.isComplex )
         throw new Error( 'Complex-valued images are not supported.' );
      directory = directory || cleanDirectory( source );
      target = cleanUniquePath( directory, File.extractName( source ) + suffix );
      stage = cleanUniquePath( directory, '.xisf_clean_' + Date.now() + '_' + Math.random().toString( 36 ).slice( 2 ) );
      if ( !main.saveAs( stage, false, false, true, false ) )
         throw new Error( 'Unable to save output.' );
      check = ImageWindow.open( stage, '', '', true );
      if ( check.length != 1 )
         throw new Error( 'Output must contain exactly one image.' );
      cleanVerifyPixels( main.mainView.image, check[0].mainView.image );
      cleanClose( check );
      check = [];
      cleanClose( windows );
      windows = [];
      // Refuse late collisions too. Never replace an existing destination.
      if ( File.exists( target ) || File.directoryExists( target ) )
         throw new Error( 'Output appeared during processing: ' + target );
      File.move( stage, target );
      stage = '';
      if ( deleteOriginal )
      {
         try
         {
            let currentInfo = new FileInfo( source );
            if ( currentInfo.isSymbolicLink || currentInfo.size != originalSize ||
                 currentInfo.lastModified.getTime() != originalModified )
               throw new Error( 'Source file changed during processing.' );
            File.remove( source );
         }
         catch ( e ) { return 'Saved: ' + target + '; ORIGINAL NOT DELETED: ' + cleanErrorText( e ); }
      }
      return 'Saved: ' + target + (deleteOriginal ? '; original deleted' : '');
   }
   finally
   {
      cleanClose( check, true );
      cleanClose( windows, true );
      try
      {
         if ( stage && File.exists( stage ) ) File.remove( stage );
      }
      catch ( e ) { console.writeln( '** Temporary file retained: ' + stage + ': ' + cleanErrorText( e ) ); }
   }
}

class CleanerDialog extends Dialog
{
   constructor()
   {
      super();
      let self = this;
      this.windowTitle = 'Batch XISF Cleaner 1.0';
      this.files = [];
      this.help = new Label( this );
      this.help.wordWrapping = true;
      this.help.cssId = "SCPInfoLabel";
      this.help.useRichText = true;
      this.help.text = '<p><strong>Batch XISF Cleaner version 1.0</strong><br/>Batch-remove companion images from XISF files while keeping the main image.</p>';
      this.help.toolTip = 'Removes all images except the selected one, including clip/rejection high/low, drizzle weight maps and crop masks.';
      this.tree = new TreeBox( this );
      this.tree.numberOfColumns = 2;
      this.tree.setHeaderText( 0, 'Input XISF' );
      this.tree.setHeaderText( 1, 'Contents / result' );
      this.tree.multipleSelection = true;
      this.tree.rootDecoration = false;
      this.tree.headerVisible = true;
      this.tree.alternateRowColor = true;
      this.tree.setScaledMinSize( 680, 240 );
      this.tree.setColumnWidth( 0, this.logicalPixelsToPhysical( 340 ) );
      this.tree.setColumnWidth( 1, this.logicalPixelsToPhysical( 400 ) );
      this.tree.onResize = function()
      {
         let available = Math.max( 200, this.width - 8 );
         let fileWidth = Math.round( available * 0.45 );
         this.setColumnWidth( 0, fileWidth );
         this.setColumnWidth( 1, available - fileWidth );
      };
      this.fileCount = new Label( this );
      this.fileCount.text = '0 files';
      this.refresh = function()
      {
         self.tree.clear();
         for ( let path of self.files )
         {
            let node = new TreeBoxNode( self.tree );
            node.setText( 0, path );
         }
         self.fileCount.text = self.files.length + ' file(s)';
         self.updateNamePreview();
         self.inspect.enabled = self.run.enabled = self.clear.enabled = self.remove.enabled = self.files.length > 0;
      };
      this.clearStatuses = function()
      {
         for ( let i = 0; i < self.tree.numberOfChildren; ++i )
         {
            self.tree.child( i ).setText( 1, '' );
            self.tree.child( i ).setToolTip( 1, '' );
         }
      };
      function button( text, action )
      {
         let b = new PushButton( self );
         b.text = text;
         b.onClick = action;
         return b;
      }
      this.add = button( 'Add Files...', function()
      {
         let d = new OpenFileDialog;
         d.multipleSelections = true;
         d.filters = [ [ 'XISF files', '.xisf' ] ];
         if ( d.execute() )
         {
            for ( let path of d.filePaths )
               if ( !self.files.some( p => File.fullPath( p ).toLowerCase() == File.fullPath( path ).toLowerCase() ) )
                  self.files.push( path );
            self.refresh();
         }
      } );
      this.remove = button( 'Remove Selected', function()
      {
         self.files = self.files.filter( (p, i) => !self.tree.child( i ).selected );
         self.refresh();
      } );
      this.clear = button( 'Clear', function() { self.files = []; self.refresh(); } );
      this.inspect = button( 'Inspect Contents', function()
      {
         console.show();
         for ( let i = 0; i < self.files.length; ++i )
         {
            let windows = [];
            try
            {
               windows = ImageWindow.open( self.files[i], '', '', true );
               if ( windows.length == 0 ) throw new Error( 'Cannot open XISF.' );
               let details = windows.map( (w, j) => '#' + (j + 1) + ' ' + cleanImageTypeLabel( w ) + ': ' + w.mainView.id ).join( '\n' );
               let text = details;
               try
               {
                  let selected = windows.length == 1 && (self.autoSelect.checked || self.keep.value == 1)
                     ? 0 : cleanSelectImage( windows, self.autoSelect.checked ? null : self.keep.value - 1 );
                  text = 'Keep #' + (selected + 1) + ' ' + cleanImageTypeLabel( windows[selected] );
                  let removed = windows.map( (w, j) => j === selected ? '' : '#' + (j + 1) + ' ' + cleanImageTypeLabel( w ) ).filter( item => item.length > 0 );
                  text += removed.length ? '; Remove ' + removed.join( ', ' ) : '; Single-image file, skipped';
               }
               catch ( e ) { text = 'UNRESOLVED: ' + cleanErrorText( e ) + ' | ' + text; }
               self.tree.child( i ).setText( 1, text );
               self.tree.child( i ).setToolTip( 1, text + '\n' + details );
               console.writeln( self.files[i] + ': ' + text + '\n' + details );
            }
            catch ( e )
            {
               let message = 'ERROR: ' + cleanErrorText( e );
               self.tree.child( i ).setText( 1, message );
               self.tree.child( i ).setToolTip( 1, message );
            }
            finally { cleanClose( windows, true ); }
         }
      } );
      this.autoSelect = new CheckBox( this );
      this.autoSelect.text = 'Automatically identify the main image';
      this.autoSelect.checked = true;
      this.autoSelect.toolTip = 'Use image types first, then names for unknown types to exclude companion maps. Process only if exactly one candidate remains; otherwise keep the original and report an error.';
      this.autoSelect.onCheck = function( checked )
      {
         self.keep.enabled = self.keepLabel.enabled = !checked;
         self.clearStatuses();
      };
      this.keepLabel = new Label( this );
      this.keepLabel.text = 'Keep image:';
      this.keep = new SpinBox( this );
      this.keep.minValue = 1;
      this.keep.maxValue = 9999;
      this.keep.value = 1;
      this.keep.onValueUpdated = function() { self.clearStatuses(); };
      this.output = new Edit( this );
      this.suffix = new Edit( this );
      this.suffix.text = '_clean';
      this.suffix.toolTip = 'Append this text to each original filename, before .xisf. Leave empty to keep the original name; collisions receive a number.';
      this.output.toolTip = 'Leave empty to save each cleaned file next to its original.';
      this.browse = new ToolButton( this );
      this.browse.icon = this.scaledResource( ':/browser/select-file.png' );
      this.browse.setScaledFixedSize( 24, 24 );
      this.browse.toolTip = 'Select output directory';
      this.browse.onClick = function()
      {
         let d = new GetDirectoryDialog;
         d.caption = 'Select Output Directory';
         d.initialPath = self.output.text;
         if ( d.execute() ) self.output.text = d.directoryPath;
      };
      this.clearOutput = new ToolButton( this );
      this.clearOutput.icon = this.scaledResource( ':/icons/clear.png' );
      this.clearOutput.setScaledFixedSize( 24, 24 );
      this.clearOutput.toolTip = "Use each input file's directory";
      this.clearOutput.onClick = function() { self.output.text = ''; };
      this.deleteOriginal = new CheckBox( this );
      this.deleteOriginal.text = 'Delete original files after verification';
      this.deleteOriginal.checked = false;
      this.deleteOriginal.toolTip = 'Delete each original only after the cleaned output has been saved, reopened and verified pixel by pixel. Metadata is saved by PixInsight; exact metadata preservation is not checked. Confirmation is required.';
      this.run = button( 'Process', function()
      {
         let directory = self.output.text.trim();
         try { cleanValidateSuffix( self.suffix.text ); }
         catch ( e )
         {
            (new MessageBox( cleanErrorText( e ), self.windowTitle, StdIcon.Error, StdButton.Ok )).execute();
            return;
         }
         if ( !self.files.length || (directory && !File.directoryExists( directory )) )
         {
            (new MessageBox( 'Add input files and choose an existing output directory.', self.windowTitle, StdIcon.Error, StdButton.Ok )).execute();
            return;
         }
         if ( self.deleteOriginal.checked && (new MessageBox(
            'Delete the original multi-image XISF files after verification? Keep ' + (self.autoSelect.checked ? 'the automatically identified main image in each file' : 'image #' + self.keep.value) + '; all other contained images will be permanently discarded from these originals. Unresolved files retain their originals.',
            self.windowTitle, StdIcon.Warning, StdButton.No, StdButton.Yes )).execute() != StdButton.Yes )
            return;
         console.show();
         self.enabled = false;
         let failures = 0, deletionWarnings = 0, saved = 0, skipped = 0, deleted = 0;
         try
         {
            for ( let i = 0; i < self.files.length; ++i )
            {
               let result;
               try { result = cleanXISF( self.files[i], directory, self.autoSelect.checked ? null : self.keep.value - 1, self.deleteOriginal.checked, self.suffix.text ); }
               catch ( e ) { ++failures; result = 'ERROR: ' + cleanErrorText( e ); }
               if ( result.indexOf( 'Saved:' ) == 0 ) ++saved;
               if ( result.indexOf( 'Skipped:' ) == 0 ) ++skipped;
               if ( result.indexOf( 'Saved:' ) == 0 && result.endsWith( '; original deleted' ) ) ++deleted;
               if ( result.indexOf( 'ORIGINAL NOT DELETED:' ) >= 0 ) ++deletionWarnings;
               self.tree.child( i ).setText( 1, result );
               self.tree.child( i ).setToolTip( 1, result );
               console.writeln( self.files[i] + ': ' + result );
               CoreApplication.processEvents();
            }
         }
         finally { self.enabled = true; }
         let summary = '<p><b>Batch completed</b></p>' +
            '<p>Files saved: ' + saved + '<br/>' +
            'Files skipped: ' + skipped + '<br/>' +
            'Files failed: ' + failures + '</p>';
         if ( self.deleteOriginal.checked )
         {
            summary += '<p>Originals deleted: ' + deleted + '<br/>' +
               'Originals retained: ' + (self.files.length - deleted) + '</p>';
            if ( deletionWarnings > 0 )
               summary += '<p><b>Deletion warnings: ' + deletionWarnings + '</b><br/>' +
                  'Cleaned files were saved, but their originals could not be deleted.</p>';
         }
         else
            summary += '<p>All original files were retained.</p>';
         summary += '<p>See the file list and console for details.</p>';
         (new MessageBox( summary, self.windowTitle,
            failures > 0 || deletionWarnings > 0 ? StdIcon.Warning : StdIcon.Information,
            StdButton.Ok )).execute();
      } );
      this.closeButton = button( 'Close', function() { self.ok(); } );
      this.inspect.icon = this.scaledResource( ':/icons/gear.png' );
      this.run.icon = this.scaledResource( ':/icons/ok.png' );
      this.closeButton.icon = this.scaledResource( ':/icons/cancel.png' );

      this.add.text = 'Add Files';
      this.add.icon = this.scaledResource( ':/icons/add.png' );
      this.remove.icon = this.scaledResource( ':/icons/delete.png' );
      this.clear.icon = this.scaledResource( ':/icons/clear.png' );
      this.run.text = 'Run';
      this.run.icon = this.scaledResource( ':/icons/power.png' );
      this.closeButton.text = 'Exit';
      this.closeButton.icon = this.scaledResource( ':/icons/close.png' );
      this.filesGroup = new GroupBox( this );
      this.filesGroup.title = 'Input Files';
      this.filesGroup.sizer = new VerticalSizer;
      this.filesGroup.sizer.margin = 6;
      this.filesGroup.sizer.spacing = 4;
      this.filesGroup.sizer.add( this.tree, 100 );
      let filesRow = new HorizontalSizer;
      filesRow.spacing = 4;
      filesRow.add( this.add );
      filesRow.add( this.fileCount );
      filesRow.addStretch();
      filesRow.add( this.remove );
      filesRow.add( this.clear );
      this.filesGroup.sizer.add( filesRow );

      // Native batch-tool grouping with Rename's read-only filename preview.
      let labelWidth = this.font.width( 'Output Directory: ' ) + 4;
      function label( text )
      {
         let item = new Label( self );
         item.text = text;
         item.setFixedWidth( labelWidth );
         item.textAlignment = TextAlignment.Right | TextAlignment.VertCenter;
         return item;
      }
      function row( caption, controls, stretchFirst = false )
      {
         let result = new HorizontalSizer;
         result.spacing = 4;
         result.add( label( caption ) );
         for ( let i = 0; i < controls.length; ++i )
            result.add( controls[i], stretchFirst && i == 0 ? 100 : 0 );
         if ( !stretchFirst ) result.addStretch();
         return result;
      }
      let outputRow = new HorizontalSizer;
      outputRow.spacing = 6;
      outputRow.add( this.output, 100 );
      outputRow.add( this.clearOutput );
      outputRow.add( this.browse );
      this.directoryGroup = new GroupBox( this );
      this.directoryGroup.title = 'Output Directory';
      this.directoryGroup.sizer = new VerticalSizer;
      this.directoryGroup.sizer.margin = 6;
      this.directoryGroup.sizer.add( outputRow );
      this.directoryGroup.sizer.spacing = 4;
      this.directoryNote = new Label( this );
      this.directoryNote.useRichText = true;
      this.directoryNote.text = '<span style="font-size: 95%;">Leave empty to save in the original directory.</span>';
      this.directoryGroup.sizer.add( this.directoryNote );
      this.output.toolTip = 'Leave empty to save beside each original file.';
      this.suffix.setScaledFixedWidth( 270 );
      this.keep.setScaledFixedWidth( 70 );
      this.keepLabel.text = 'Keep Image:';
      this.keepLabel.textAlignment = TextAlignment.Right | TextAlignment.VertCenter;
      this.keep.toolTip = 'Manual image number, starting at 1. Disable automatic identification to change it.';
      this.autoSelect.text = 'Auto-detect Main Image';
      this.deleteOriginal.text = 'Delete Original File';
      this.outputName = new Edit( this );
      this.outputName.readOnly = true;
      this.outputName.toolTip = 'Preview for the first input file. Each file keeps its own base name. Existing names receive a number; no files are overwritten.';
      this.updateNamePreview = function()
      {
         if ( !self.files.length )
         {
            self.outputName.text = 'Example: M31' + self.suffix.text + '.xisf';
            return;
         }
         self.outputName.text = File.extractName( self.files[0] ) + self.suffix.text + '.xisf';
      };
      this.suffix.onTextUpdated = function() { self.updateNamePreview(); };
      this.outputGroup = new GroupBox( this );
      this.outputGroup.title = 'Output File Options';
      this.outputGroup.sizer = new VerticalSizer;
      this.outputGroup.sizer.margin = 6;
      this.outputGroup.sizer.spacing = 4;
      this.outputGroup.sizer.add( row( 'Filename Suffix:', [ this.suffix ] ) );
      this.outputGroup.sizer.add( row( 'Preview:', [ this.outputName ], true ) );
      this.outputGroup.sizer.add( row( '', [ this.deleteOriginal ] ) );
      this.selectionGroup = new GroupBox( this );
      this.selectionGroup.title = 'Main Image Selection';
      this.selectionGroup.sizer = new VerticalSizer;
      this.selectionGroup.sizer.margin = 6;
      this.selectionGroup.sizer.spacing = 4;
      this.selectionGroup.sizer.add( row( 'Selection:', [ this.autoSelect ] ) );
      this.keepLabel.setFixedWidth( labelWidth );
      let manualRow = new HorizontalSizer;
      manualRow.spacing = 4;
      manualRow.add( this.keepLabel );
      manualRow.add( this.keep );
      manualRow.addStretch();
      this.selectionGroup.sizer.add( manualRow );
      this.autoSelect.onCheck( true );

      this.copyrightLabel = new Label( this );
      this.copyrightLabel.useRichText = true;
      this.copyrightLabel.text = 'Copyright &copy; 2026 Fluorine Zhu';
      let runRow = new HorizontalSizer;
      runRow.spacing = 6;
      runRow.add( this.copyrightLabel );
      runRow.addStretch();
      runRow.add( this.inspect );
      runRow.add( this.run );
      runRow.add( this.closeButton );
      this.sizer = new VerticalSizer;
      this.sizer.margin = 8;
      this.sizer.spacing = 8;
      this.sizer.add( this.help );
      this.sizer.add( this.filesGroup, 100 );
      this.sizer.add( this.selectionGroup );
      this.sizer.add( this.directoryGroup );
      this.sizer.add( this.outputGroup );
      this.sizer.add( runRow );
      this.refresh();
      this.adjustToContents();
   }
}

function main()
{
   (new CleanerDialog).execute();
}
main();
